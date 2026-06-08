const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static assets from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Maps and Lists for Matchmaking Lobby
const onlineUsers = new Map();       // socketId -> { id, username, status: 'lobby'|'playing' }
const rejectionCooldowns = [];       // List of { from, to, expiresAt }
const rooms = new Map();             // roomId -> roomState

// Win Check Combinations
const WIN_COMBINATIONS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function checkWin(board, symbol) {
  for (const combo of WIN_COMBINATIONS) {
    if (board[combo[0]] === symbol &&
        board[combo[1]] === symbol &&
        board[combo[2]] === symbol) {
      return combo;
    }
  }
  return null;
}

// Helper to generate unique username
function generateUniqueUsername() {
  let username;
  let isUnique = false;
  while (!isUnique) {
    username = `Player_${Math.floor(1000 + Math.random() * 9000)}`;
    isUnique = true;
    for (const user of onlineUsers.values()) {
      if (user.username === username) {
        isUnique = false;
        break;
      }
    }
  }
  return username;
}

// Get player list tailored for a specific client socket (includes their cooldowns)
function getPlayerList(clientSocketId) {
  const list = [];
  const now = Date.now();
  for (const [id, user] of onlineUsers.entries()) {
    // Skip self in the lists displayed to user
    if (id === clientSocketId) continue;

    // Check if there is an active cooldown from clientSocketId to this player
    const cooldown = rejectionCooldowns.find(
      c => c.from === clientSocketId && c.to === id && c.expiresAt > now
    );
    const cooldownRemaining = cooldown ? Math.ceil((cooldown.expiresAt - now) / 1000) : 0;

    list.push({
      id,
      username: user.username,
      status: user.status,
      cooldownRemaining
    });
  }
  return list;
}

// Broadcast tailored player list to all online lobby clients
function broadcastPlayerList() {
  for (const socketId of onlineUsers.keys()) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('playerListUpdate', getPlayerList(socketId));
    }
  }
}

// Periodically clean up expired cooldowns
setInterval(() => {
  const now = Date.now();
  let expiredCount = 0;
  for (let i = rejectionCooldowns.length - 1; i >= 0; i--) {
    if (rejectionCooldowns[i].expiresAt <= now) {
      rejectionCooldowns.splice(i, 1);
      expiredCount++;
    }
  }
  if (expiredCount > 0) {
    broadcastPlayerList();
  }
}, 5000);

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create default user profile
  const username = generateUniqueUsername();
  const userProfile = {
    id: socket.id,
    username,
    status: 'lobby'
  };
  onlineUsers.set(socket.id, userProfile);

  // Send default username back to client
  socket.emit('initProfile', userProfile);

  // Broadcast updated lists
  broadcastPlayerList();

  // 1. Change Username event
  socket.on('changeUsername', ({ newUsername }, callback) => {
    if (typeof callback !== 'function') return;

    const name = newUsername.trim();
    if (!name || name.length > 12) {
      callback({ success: false, message: 'Invalid username length (1-12 chars).' });
      return;
    }

    // Check uniqueness
    let taken = false;
    for (const [id, user] of onlineUsers.entries()) {
      if (id !== socket.id && user.username.toLowerCase() === name.toLowerCase()) {
        taken = true;
        break;
      }
    }

    if (taken) {
      callback({ success: false, message: 'Username is already taken!' });
      return;
    }

    // Accept change
    const profile = onlineUsers.get(socket.id);
    if (profile) {
      profile.username = name;
      callback({ success: true, username: name });
      broadcastPlayerList();
      console.log(`Socket ${socket.id} changed username to ${name}`);
    } else {
      callback({ success: false, message: 'Profile not found.' });
    }
  });

  // 2. Send Match Request
  socket.on('sendMatchRequest', ({ targetId }) => {
    const sender = onlineUsers.get(socket.id);
    const target = onlineUsers.get(targetId);

    if (!sender || !target) {
      socket.emit('errorMsg', { message: 'Player not found.' });
      return;
    }

    if (target.status !== 'lobby') {
      socket.emit('errorMsg', { message: 'Player is currently in a game.' });
      return;
    }

    // Check cooldowns
    const now = Date.now();
    const cooldown = rejectionCooldowns.find(
      c => c.from === socket.id && c.to === targetId && c.expiresAt > now
    );

    if (cooldown) {
      const remaining = Math.ceil((cooldown.expiresAt - now) / 1000);
      socket.emit('errorMsg', { message: `Please wait ${remaining}s before requesting this player again.` });
      return;
    }

    // Emit invitation to target
    io.to(targetId).emit('incomingMatchRequest', {
      fromId: socket.id,
      fromUsername: sender.username
    });
  });

  // 3. Respond to Request
  socket.on('respondToRequest', ({ senderId, accepted }) => {
    const sender = onlineUsers.get(senderId);
    const target = onlineUsers.get(socket.id);

    if (!sender || !target) {
      socket.emit('errorMsg', { message: 'Match request invalid or player disconnected.' });
      return;
    }

    if (accepted) {
      // Both must be available
      if (sender.status !== 'lobby' || target.status !== 'lobby') {
        socket.emit('errorMsg', { message: 'One or both players are no longer available.' });
        io.to(senderId).emit('errorMsg', { message: 'One or both players are no longer available.' });
        return;
      }

      // Generate a match room
      const roomId = `room_${senderId}_${socket.id}`;
      const roomState = {
        id: roomId,
        players: [
          { id: senderId, username: sender.username, symbol: 'X' },
          { id: socket.id, username: target.username, symbol: 'O' }
        ],
        board: Array(9).fill(null),
        moves: { X: [], O: [] },
        turn: 'X',
        winner: null,
        winningLine: null,
        status: 'playing'
      };

      rooms.set(roomId, roomState);

      // Join room socket channel
      const senderSocket = io.sockets.sockets.get(senderId);
      if (senderSocket) senderSocket.join(roomId);
      socket.join(roomId);

      // Update statuses
      sender.status = 'playing';
      target.status = 'playing';

      // Start match
      io.to(roomId).emit('gameStart', {
        roomId,
        players: roomState.players,
        state: {
          board: roomState.board,
          moves: roomState.moves,
          turn: roomState.turn,
          winner: roomState.winner,
          winningLine: roomState.winningLine,
          status: roomState.status
        }
      });

      broadcastPlayerList();
      console.log(`Match started between ${sender.username} and ${target.username} in ${roomId}`);
    } else {
      // Add rejection cooldown
      rejectionCooldowns.push({
        from: senderId,
        to: socket.id,
        expiresAt: Date.now() + 60 * 1000 // 1 minute
      });

      io.to(senderId).emit('requestRejected', {
        byId: socket.id,
        byUsername: target.username
      });

      // Update lists to reflect new cooldown
      broadcastPlayerList();
    }
  });

  // 4. Make Move in Room
  socket.on('makeMove', ({ roomId, cellIndex }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.symbol !== room.turn) {
      socket.emit('errorMsg', { message: "It's not your turn!" });
      return;
    }

    const symbol = player.symbol;

    if (cellIndex < 0 || cellIndex > 8 || room.board[cellIndex] !== null) {
      socket.emit('errorMsg', { message: 'Invalid move!' });
      return;
    }

    // Apply Infinite rule (directly remove, no blinking)
    let removedIndex = null;
    if (room.moves[symbol].length >= 3) {
      removedIndex = room.moves[symbol].shift();
      room.board[removedIndex] = null;
    }

    room.moves[symbol].push(cellIndex);
    room.board[cellIndex] = symbol;

    const winLine = checkWin(room.board, symbol);
    if (winLine) {
      room.winner = symbol;
      room.winningLine = winLine;
      room.status = 'ended';
    } else {
      room.turn = symbol === 'X' ? 'O' : 'X';
    }

    io.to(roomId).emit('stateUpdate', {
      board: room.board,
      moves: room.moves,
      turn: room.turn,
      winner: room.winner,
      winningLine: room.winningLine,
      status: room.status,
      lastMove: {
        player: symbol,
        placed: cellIndex,
        removed: removedIndex
      }
    });
  });

  // 5. Play Again (Reset Match)
  socket.on('playAgain', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'ended') return;

    room.board = Array(9).fill(null);
    room.moves = { X: [], O: [] };
    room.turn = room.winner || 'X';
    room.winner = null;
    room.winningLine = null;
    room.status = 'playing';

    io.to(roomId).emit('gameStart', {
      roomId,
      players: room.players,
      state: {
        board: room.board,
        moves: room.moves,
        turn: room.turn,
        winner: room.winner,
        winningLine: room.winningLine,
        status: room.status
      }
    });
  });

  // 6. Handle Quit Game / Return to Lobby
  socket.on('quitGame', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    // Reset statuses to lobby
    room.players.forEach(p => {
      const u = onlineUsers.get(p.id);
      if (u) u.status = 'lobby';
      
      const pSocket = io.sockets.sockets.get(p.id);
      if (pSocket) pSocket.leave(roomId);
    });

    rooms.delete(roomId);
    broadcastPlayerList();
  });

  // 7. Disconnect handler
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Remove from online list
    onlineUsers.delete(socket.id);

    // Clean up active rooms involving this player
    for (const [roomId, room] of rooms.entries()) {
      const inRoom = room.players.some(p => p.id === socket.id);
      if (inRoom) {
        room.players.forEach(p => {
          if (p.id !== socket.id) {
            const opponent = onlineUsers.get(p.id);
            if (opponent) opponent.status = 'lobby';

            const oppSocket = io.sockets.sockets.get(p.id);
            if (oppSocket) {
              oppSocket.leave(roomId);
              oppSocket.emit('partnerDisconnected', {
                message: 'Your opponent disconnected. Returning to lobby...'
              });
            }
          }
        });
        rooms.delete(roomId);
      }
    }

    // Clean up cooldown entries
    for (let i = rejectionCooldowns.length - 1; i >= 0; i--) {
      if (rejectionCooldowns[i].from === socket.id || rejectionCooldowns[i].to === socket.id) {
        rejectionCooldowns.splice(i, 1);
      }
    }

    broadcastPlayerList();
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
