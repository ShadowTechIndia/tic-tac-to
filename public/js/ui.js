import gameAudio from './audio.js';
import { LocalGame } from './game.js';
import onlineManager from './socket.js';

// DOM Element Selectors
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const winModal = document.getElementById('win-modal');
const rulesModal = document.getElementById('rules-modal');
const inviteModal = document.getElementById('invite-modal');

// Buttons
const btnPassPlay = document.getElementById('mode-pass-play');
const btnVsComputer = document.getElementById('mode-vs-computer');
const btnQuitGame = document.getElementById('btn-quit-game');
const btnModalRestart = document.getElementById('btn-modal-restart');
const btnModalQuit = document.getElementById('btn-modal-quit');
const btnMute = document.getElementById('mute-btn');
const btnRules = document.getElementById('rules-btn');
const btnRulesClose = document.getElementById('btn-rules-close');

// Username Settings Elements
const usernameInput = document.getElementById('username-input');
const btnSaveUsername = document.getElementById('btn-save-username');
const usernameStatusMsg = document.getElementById('username-status-msg');

// Lobby List Elements
const onlinePlayersList = document.getElementById('online-players-list');

// Invite Modal Elements
const inviteMessage = document.getElementById('invite-message');
const btnInviteAccept = document.getElementById('btn-invite-accept');
const btnInviteReject = document.getElementById('btn-invite-reject');

// Game Elements
const boardElement = document.getElementById('board');
const cellElements = document.querySelectorAll('.grid-cell');
const winnerLineElement = document.getElementById('winner-line');
const turnBannerElement = document.getElementById('turn-banner');
const currentTurnValue = document.getElementById('current-turn-value');
const logsContainer = document.getElementById('logs-container');

// Player Card Elements
const playerXCard = document.getElementById('player-x-card');
const playerOCard = document.getElementById('player-o-card');
const playerXName = document.getElementById('player-x-name');
const playerOName = document.getElementById('player-o-name');
const playerXMarksCount = document.getElementById('player-x-marks-count');
const playerOMarksCount = document.getElementById('player-o-marks-count');
const xWarningBadge = document.getElementById('x-warning-badge');
const oWarningBadge = document.getElementById('o-warning-badge');

const winHeadline = document.getElementById('win-headline');
const winMessage = document.getElementById('win-message');

// Game State Variables
let activeMode = null; // 'pass-play', 'vs-computer', 'online'
let localGame = null;  // LocalGame instance
let onlineRole = null;  // 'X' or 'O' in online mode
let prevBoard = Array(9).fill(null); // Track board diffs for animations

// Active Invite Variables
let pendingInviteSenderId = null;

// Track active client-side cooldown intervals to avoid memory leaks
const cooldownIntervals = new Map();

const CELL_NAMES = [
  'Top-Left', 'Top-Center', 'Top-Right',
  'Middle-Left', 'Center', 'Middle-Right',
  'Bottom-Left', 'Bottom-Center', 'Bottom-Right'
];

// Initialize application listeners
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  // Automatically connect to matchmaking lobby on load
  initializeLobbyConnection();
});

function setupEventListeners() {
  // Mode selection clicks
  btnPassPlay.addEventListener('click', () => startLocalGame('pass-play'));
  btnVsComputer.addEventListener('click', () => startLocalGame('vs-computer'));
  
  // Lobby save username
  btnSaveUsername.addEventListener('click', handleSaveUsername);

  // Lobby Invite Modal clicks
  btnInviteAccept.addEventListener('click', () => {
    if (pendingInviteSenderId) {
      gameAudio.playPlace();
      onlineManager.respondToRequest(pendingInviteSenderId, true);
      inviteModal.classList.remove('active');
      pendingInviteSenderId = null;
    }
  });

  btnInviteReject.addEventListener('click', () => {
    if (pendingInviteSenderId) {
      gameAudio.playError();
      onlineManager.respondToRequest(pendingInviteSenderId, false);
      inviteModal.classList.remove('active');
      pendingInviteSenderId = null;
    }
  });

  // Lobby quit actions
  btnQuitGame.addEventListener('click', quitToLobby);
  btnModalQuit.addEventListener('click', () => {
    winModal.classList.remove('active');
    quitToLobby();
  });

  // Cell clicks
  cellElements.forEach(cell => {
    cell.addEventListener('click', () => handleCellClick(parseInt(cell.dataset.index)));
  });

  // Restart Actions
  btnModalRestart.addEventListener('click', () => {
    winModal.classList.remove('active');
    if (activeMode === 'online') {
      onlineManager.requestPlayAgain();
    } else {
      startLocalGame(activeMode);
    }
  });

  // Sound toggle
  btnMute.addEventListener('click', () => {
    const isMuted = gameAudio.toggleMute();
    btnMute.innerHTML = isMuted 
      ? '<i class="fa-solid fa-volume-xmark"></i>' 
      : '<i class="fa-solid fa-volume-high"></i>';
  });

  // Rules modal
  btnRules.addEventListener('click', () => {
    rulesModal.classList.add('active');
    gameAudio.playPlace();
  });
  btnRulesClose.addEventListener('click', () => {
    rulesModal.classList.remove('active');
  });
}

// -------------------------------------------------------------
// ONLINE MATCHMAKING LOBBY
// -------------------------------------------------------------

function initializeLobbyConnection() {
  const savedName = localStorage.getItem('username');

  const callbacks = {
    onInitProfile: (profile) => {
      // If client has no saved username, use default assigned by server
      if (!savedName) {
        usernameInput.value = profile.username;
        localStorage.setItem('username', profile.username);
      } else {
        // Attempt to sync client's saved username to the server on load
        usernameInput.value = savedName;
        onlineManager.changeUsername(savedName, (res) => {
          if (!res.success) {
            // Username collision on saved name, fallback to server unique default
            usernameInput.value = profile.username;
            localStorage.setItem('username', profile.username);
            showStatusMsg(`Saved name taken. Assigned: ${profile.username}`, 'error');
          }
        });
      }
    },
    onPlayerListUpdate: (players) => {
      renderOnlinePlayers(players);
    },
    onIncomingRequest: (fromId, fromUsername) => {
      gameAudio.playPlace();
      pendingInviteSenderId = fromId;
      inviteMessage.innerHTML = `<strong>${fromUsername}</strong> has requested to play a match with you.`;
      inviteModal.classList.add('active');
    },
    onRequestRejected: (byId, byUsername) => {
      gameAudio.playError();
      alert(`Match request rejected by ${byUsername}. 1-minute cooldown applied.`);
    },
    onGameStart: ({ player, opponent, state }) => {
      activeMode = 'online';
      onlineRole = player.symbol;
      prevBoard = Array(9).fill(null);

      // Hide active modals
      inviteModal.classList.remove('active');
      winModal.classList.remove('active');

      // Set sidebars
      if (player.symbol === 'X') {
        playerXName.textContent = `${player.username} (You)`;
        playerOName.textContent = opponent.username;
      } else {
        playerOName.textContent = `${player.username} (You)`;
        playerXName.textContent = opponent.username;
      }

      showScreen('game');
      resetBoardUI();
      renderGameState(state);
      addLogEntry(null, `Match started. You are Player ${player.symbol}`);
    },
    onStateUpdate: (state) => {
      renderGameState(state);
    },
    onPartnerDisconnected: (msg) => {
      gameAudio.playError();
      addLogEntry(null, msg);
      alert(msg);
      quitToLobby();
    },
    onError: (msg) => {
      gameAudio.playError();
      alert(msg);
    }
  };

  onlineManager.connect(callbacks);
}

function handleSaveUsername() {
  const name = usernameInput.value.trim();
  if (!name) {
    showStatusMsg('Name cannot be empty.', 'error');
    return;
  }

  btnSaveUsername.disabled = true;
  showStatusMsg('Saving...', 'success');

  onlineManager.changeUsername(name, (res) => {
    btnSaveUsername.disabled = false;
    if (res.success) {
      localStorage.setItem('username', res.username);
      showStatusMsg('Name updated successfully!', 'success');
    } else {
      showStatusMsg(res.message, 'error');
    }
  });
}

function showStatusMsg(text, type) {
  usernameStatusMsg.textContent = text;
  usernameStatusMsg.className = `status-msg ${type}`;
  setTimeout(() => {
    usernameStatusMsg.textContent = '';
  }, 4000);
}

function renderOnlinePlayers(players) {
  // Clear any running client countdown intervals to prevent duplicates
  for (const interval of cooldownIntervals.values()) {
    clearInterval(interval);
  }
  cooldownIntervals.clear();

  // Clear listing
  onlinePlayersList.innerHTML = '';

  if (players.length === 0) {
    onlinePlayersList.innerHTML = `
      <div class="empty-list-placeholder">
        <i class="fa-solid fa-users-slash"></i>
        <p>No other players are online yet. Open another tab/browser to test!</p>
      </div>
    `;
    return;
  }

  players.forEach(p => {
    const item = document.createElement('div');
    item.className = 'player-list-item';

    const details = document.createElement('div');
    details.className = 'player-item-details';

    const name = document.createElement('span');
    name.className = 'player-item-name';
    name.textContent = p.username;

    const statusWrapper = document.createElement('div');
    statusWrapper.className = 'player-item-status-wrapper';

    const badge = document.createElement('span');
    badge.className = `status-badge ${p.status === 'playing' ? 'playing' : 'available'}`;
    badge.textContent = p.status === 'playing' ? 'In Game' : 'Available';

    statusWrapper.appendChild(badge);
    details.appendChild(name);
    details.appendChild(statusWrapper);

    const actionDiv = document.createElement('div');
    actionDiv.className = 'player-item-actions';

    const actionBtn = document.createElement('button');
    actionBtn.className = 'btn btn-primary btn-invite';

    if (p.status === 'playing') {
      actionBtn.textContent = 'Busy';
      actionBtn.disabled = true;
      actionBtn.className = 'btn btn-secondary btn-invite';
    } else if (p.cooldownRemaining > 0) {
      let secondsLeft = p.cooldownRemaining;
      actionBtn.textContent = `Cooldown (${secondsLeft}s)`;
      actionBtn.className = 'btn btn-invite cooldown';
      actionBtn.disabled = true;

      // Start client side timer countdown
      const interval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
          actionBtn.textContent = 'Request Match';
          actionBtn.className = 'btn btn-primary btn-invite';
          actionBtn.disabled = false;
          clearInterval(interval);
          cooldownIntervals.delete(p.id);
        } else {
          actionBtn.textContent = `Cooldown (${secondsLeft}s)`;
        }
      }, 1000);

      cooldownIntervals.set(p.id, interval);
    } else {
      actionBtn.textContent = 'Request Match';
      actionBtn.addEventListener('click', () => {
        gameAudio.playPlace();
        onlineManager.sendMatchRequest(p.id);
        actionBtn.textContent = 'Sent...';
        actionBtn.disabled = true;
        setTimeout(() => {
          actionBtn.textContent = 'Request Match';
          actionBtn.disabled = false;
        }, 3000);
      });
    }

    actionDiv.appendChild(actionBtn);
    item.appendChild(details);
    item.appendChild(actionDiv);
    onlinePlayersList.appendChild(item);
  });
}

// -------------------------------------------------------------
// LOCAL GAME SETUP
// -------------------------------------------------------------

function startLocalGame(mode) {
  activeMode = mode;
  localGame = new LocalGame(mode);
  prevBoard = Array(9).fill(null);
  
  // Set card names
  playerXName.textContent = usernameInput.value || 'Player X';
  playerOName.textContent = mode === 'vs-computer' ? 'Computer Bot' : 'Player O';

  showScreen('game');
  resetBoardUI();
  updateTurnUI('X');
  
  // Set count indicators
  playerXMarksCount.textContent = '0';
  playerOMarksCount.textContent = '0';

  addLogEntry(null, `Match started: ${mode === 'vs-computer' ? 'Player vs Bot' : 'Pass & Play'}`);
}

function quitToLobby() {
  if (activeMode === 'online') {
    onlineManager.quitGame();
  }
  activeMode = null;
  localGame = null;
  onlineRole = null;
  showScreen('lobby');
  gameAudio.playPlace();
}

// -------------------------------------------------------------
// GAMEPLAY RENDERING AND BOARD LOGIC
// -------------------------------------------------------------

function handleCellClick(index) {
  if (activeMode === 'online') {
    // Online move validation (only click if it's my turn)
    if (currentTurnValue.textContent === onlineRole) {
      onlineManager.makeMove(index);
    } else {
      gameAudio.playError();
    }
  } else if (localGame && !localGame.winner) {
    // Local move validation
    if (activeMode === 'vs-computer' && localGame.turn === 'O') {
      gameAudio.playError(); // Click ignored during AI turn
      return;
    }

    const res = localGame.makeMove(index);
    if (res.success) {
      handleMoveSuccess(res);
      
      // If computer mode, schedule AI move
      if (activeMode === 'vs-computer' && !res.winner) {
        setTimeout(handleAIMove, 600);
      }
    } else {
      gameAudio.playError();
    }
  }
}

function handleAIMove() {
  if (!localGame || localGame.winner) return;
  const aiMoveIndex = localGame.getComputerMove();
  if (aiMoveIndex !== null) {
    const res = localGame.makeMove(aiMoveIndex);
    if (res.success) {
      handleMoveSuccess(res);
    }
  }
}

function handleMoveSuccess(res) {
  gameAudio.playPlace();
  if (res.removed !== null) {
    gameAudio.playRemove();
  }

  // Draw mark
  drawMark(res.placed, res.winner ? res.winner : (res.turn === 'X' ? 'O' : 'X'));

  // Handle deletion (instant removal, no animation delay)
  if (res.removed !== null) {
    animateMarkRemoval(res.removed);
  }

  // Record history
  const playerSymbol = res.winner ? res.winner : (res.turn === 'X' ? 'O' : 'X');
  const removedText = res.removed !== null ? `(Removed ${CELL_NAMES[res.removed]})` : '';
  addLogEntry(playerSymbol, `placed at ${CELL_NAMES[res.placed]} ${removedText}`);

  // Update turn & UI markers
  updateTurnUI(res.turn);
  renderQueueCounters(localGame.moves);
  highlightOldestMarks(localGame.moves, res.turn);

  // Check victory
  if (res.winner) {
    triggerVictory(res.winner, res.winningLine);
  }
}

function renderGameState(state) {
  // Compare state board with local board for audio/triggers
  for (let i = 0; i < 9; i++) {
    const currentVal = state.board[i];
    const prevVal = prevBoard[i];

    if (currentVal !== prevVal) {
      if (currentVal !== null) {
        drawMark(i, currentVal);
        if (state.lastMove && state.lastMove.placed === i) {
          gameAudio.playPlace();
        }
      } else {
        animateMarkRemoval(i);
        if (state.lastMove && state.lastMove.removed === i) {
          gameAudio.playRemove();
        }
      }
    }
  }

  // Append history log
  if (state.lastMove) {
    const m = state.lastMove;
    const removedText = m.removed !== null ? `(Removed ${CELL_NAMES[m.removed]})` : '';
    addLogEntry(m.player, `placed at ${CELL_NAMES[m.placed]} ${removedText}`);
  }

  // Cache board
  prevBoard = [...state.board];

  // Render counters
  renderQueueCounters(state.moves);
  highlightOldestMarks(state.moves, state.turn);

  // Update Turn Info
  updateTurnUI(state.turn);

  if (state.status === 'ended' && state.winner) {
    triggerVictory(state.winner, state.winningLine);
  }
}

// -------------------------------------------------------------
// UI DRAWING AND COMPONENT ACTIONS
// -------------------------------------------------------------

function drawMark(cellIndex, symbol) {
  const cell = document.getElementById(`cell-${cellIndex}`);
  cell.classList.remove('cell-oldest');
  
  if (symbol === 'X') {
    cell.innerHTML = `
      <svg viewBox="0 0 100 100">
        <path class="svg-path-x" d="M20,20 L80,80" />
        <path class="svg-path-x svg-path-x-2" d="M80,20 L20,80" />
      </svg>
    `;
    cell.style.setProperty('--glow-color', 'var(--color-x-glow)');
  } else if (symbol === 'O') {
    cell.innerHTML = `
      <svg viewBox="0 0 100 100">
        <circle class="svg-path-o" cx="50" cy="50" r="32" />
      </svg>
    `;
    cell.style.setProperty('--glow-color', 'var(--color-o-glow)');
  }
}

function animateMarkRemoval(cellIndex) {
  const cell = document.getElementById(`cell-${cellIndex}`);
  cell.innerHTML = '';
  cell.className = 'grid-cell';
}

function highlightOldestMarks(moves, turn) {
  // Clear any existing highlighting (direct removal mode)
  cellElements.forEach(cell => cell.classList.remove('cell-oldest'));
  xWarningBadge.style.display = 'none';
  oWarningBadge.style.display = 'none';
}

function renderQueueCounters(moves) {
  playerXMarksCount.textContent = moves.X.length;
  playerOMarksCount.textContent = moves.O.length;
}

function updateTurnUI(turn) {
  currentTurnValue.textContent = turn;
  if (turn === 'X') {
    currentTurnValue.className = 'player-x-text';
    playerXCard.classList.add('active-card');
    playerOCard.classList.remove('active-card');
  } else {
    currentTurnValue.className = 'player-o-text';
    playerOCard.classList.add('active-card');
    playerXCard.classList.remove('active-card');
  }
}

function triggerVictory(winner, winningLine) {
  gameAudio.playWin();

  // Position strike winner line overlay
  const comboStr = getComboString(winningLine);
  winnerLineElement.className = `winner-line active ${comboStr}`;

  // Get winning name
  let winnerName = winner === 'X' ? playerXName.textContent : playerOName.textContent;
  if (activeMode === 'online' && winner === onlineRole) {
    winHeadline.textContent = 'Victory!';
    winMessage.textContent = `Congratulations, you won the match!`;
  } else if (activeMode === 'online') {
    winHeadline.textContent = 'Defeat!';
    winMessage.textContent = `${winnerName} has won the match. Better luck next time!`;
  } else {
    winHeadline.textContent = 'Victory!';
    winMessage.textContent = `${winnerName} has won the match!`;
  }

  // Delay modal appearance so users can see the winning line draw
  setTimeout(() => {
    winModal.classList.add('active');
  }, 1000);
}

function getComboString(combo) {
  const sorted = [...combo].sort((a,b) => a-b);
  const rows = [[0,1,2], [3,4,5], [6,7,8]];
  const cols = [[0,3,6], [1,4,7], [2,5,8]];
  
  const rowIndex = rows.findIndex(r => r.every((v,i) => v === sorted[i]));
  if (rowIndex !== -1) return `row-${rowIndex}`;

  const colIndex = cols.findIndex(c => c.every((v,i) => v === sorted[i]));
  if (colIndex !== -1) return `col-${colIndex}`;

  if (sorted[0] === 0 && sorted[1] === 4 && sorted[2] === 8) return 'diag-0';
  if (sorted[0] === 2 && sorted[1] === 4 && sorted[2] === 6) return 'diag-1';
  return '';
}

function addLogEntry(symbol, text) {
  // Clear empty log message on first entry
  const emptyMsg = logsContainer.querySelector('.empty-log-msg');
  if (emptyMsg) emptyMsg.remove();

  const entry = document.createElement('div');
  entry.className = 'log-entry';

  if (symbol) {
    entry.className += ` log-${symbol.toLowerCase()}`;
    entry.innerHTML = `
      <div class="badge">${symbol}</div>
      <div class="log-text">${text}</div>
    `;
  } else {
    entry.innerHTML = `
      <div class="log-text" style="color: var(--text-secondary); text-align: center; width: 100%; font-weight: 500;">
        ${text}
      </div>
    `;
  }

  logsContainer.appendChild(entry);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

function resetBoardUI() {
  cellElements.forEach(cell => {
    cell.innerHTML = '';
    cell.className = 'grid-cell';
  });
  winnerLineElement.className = 'winner-line';
  logsContainer.innerHTML = '<div class="empty-log-msg">No moves placed yet.</div>';
}

function showScreen(screen) {
  lobbyScreen.classList.remove('active');
  gameScreen.classList.remove('active');

  if (screen === 'lobby') {
    lobbyScreen.classList.add('active');
  } else if (screen === 'game') {
    gameScreen.classList.add('active');
  }
}
