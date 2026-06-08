class OnlineManager {
  constructor() {
    this.socket = null;
    this.roomId = null;
    this.player = null; // { id, username, symbol }
    this.opponent = null; // { id, username, symbol }
    this.uiCallbacks = {};
  }

  // Connect to the socket server
  connect(callbacks) {
    this.uiCallbacks = callbacks;

    if (this.socket) return; // Already connected

    if (typeof io === 'undefined') {
      console.error('Socket.io client library not loaded.');
      return;
    }

    this.socket = io();

    this.socket.on('connect', () => {
      console.log('Connected to socket server:', this.socket.id);
    });

    this.socket.on('initProfile', (profile) => {
      if (this.uiCallbacks.onInitProfile) {
        this.uiCallbacks.onInitProfile(profile);
      }
    });

    this.socket.on('playerListUpdate', (players) => {
      if (this.uiCallbacks.onPlayerListUpdate) {
        this.uiCallbacks.onPlayerListUpdate(players);
      }
    });

    this.socket.on('incomingMatchRequest', ({ fromId, fromUsername }) => {
      if (this.uiCallbacks.onIncomingRequest) {
        this.uiCallbacks.onIncomingRequest(fromId, fromUsername);
      }
    });

    this.socket.on('requestRejected', ({ byId, byUsername }) => {
      if (this.uiCallbacks.onRequestRejected) {
        this.uiCallbacks.onRequestRejected(byId, byUsername);
      }
    });

    this.socket.on('gameStart', ({ roomId, players, state }) => {
      this.roomId = roomId;
      this.player = players.find(p => p.id === this.socket.id);
      this.opponent = players.find(p => p.id !== this.socket.id);

      if (this.uiCallbacks.onGameStart) {
        this.uiCallbacks.onGameStart({
          player: this.player,
          opponent: this.opponent,
          state
        });
      }
    });

    this.socket.on('stateUpdate', (state) => {
      if (this.uiCallbacks.onStateUpdate) {
        this.uiCallbacks.onStateUpdate(state);
      }
    });

    this.socket.on('partnerDisconnected', ({ message }) => {
      if (this.uiCallbacks.onPartnerDisconnected) {
        this.uiCallbacks.onPartnerDisconnected(message);
      }
    });

    this.socket.on('errorMsg', ({ message }) => {
      if (this.uiCallbacks.onError) {
        this.uiCallbacks.onError(message);
      }
    });
  }

  changeUsername(newUsername, callback) {
    if (this.socket) {
      this.socket.emit('changeUsername', { newUsername }, callback);
    }
  }

  sendMatchRequest(targetId) {
    if (this.socket) {
      this.socket.emit('sendMatchRequest', { targetId });
    }
  }

  respondToRequest(senderId, accepted) {
    if (this.socket) {
      this.socket.emit('respondToRequest', { senderId, accepted });
    }
  }

  makeMove(cellIndex) {
    if (this.socket && this.roomId) {
      this.socket.emit('makeMove', { roomId: this.roomId, cellIndex });
    }
  }

  requestPlayAgain() {
    if (this.socket && this.roomId) {
      this.socket.emit('playAgain', { roomId: this.roomId });
    }
  }

  quitGame() {
    if (this.socket && this.roomId) {
      this.socket.emit('quitGame', { roomId: this.roomId });
      this.roomId = null;
      this.player = null;
      this.opponent = null;
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.roomId = null;
      this.player = null;
      this.opponent = null;
    }
  }
}

const onlineManager = new OnlineManager();
export default onlineManager;
