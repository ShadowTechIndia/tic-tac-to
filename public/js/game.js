const WIN_COMBINATIONS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // horizontal
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // vertical
  [0, 4, 8], [2, 4, 6]             // diagonal
];

export function checkWin(board, symbol) {
  for (const combo of WIN_COMBINATIONS) {
    if (board[combo[0]] === symbol &&
        board[combo[1]] === symbol &&
        board[combo[2]] === symbol) {
      return combo;
    }
  }
  return null;
}

export class LocalGame {
  constructor(mode = 'pass-and-play') {
    this.mode = mode; // 'pass-and-play' or 'vs-computer'
    this.board = Array(9).fill(null);
    this.moves = { X: [], O: [] };
    this.turn = 'X';
    this.winner = null;
    this.winningLine = null;
  }

  // Returns { success: boolean, placed: index, removed: index | null, winner: symbol | null, winningLine: array | null, error: string | null }
  makeMove(cellIndex) {
    if (this.winner) {
      return { success: false, error: 'Game has already ended.' };
    }

    if (this.board[cellIndex] !== null) {
      return { success: false, error: 'Cell is already occupied.' };
    }

    const currentSymbol = this.turn;
    let removedIndex = null;

    // Apply Infinite rule: If 3 marks already, remove the oldest one
    if (this.moves[currentSymbol].length >= 3) {
      removedIndex = this.moves[currentSymbol].shift();
      this.board[removedIndex] = null;
    }

    // Place the new mark
    this.moves[currentSymbol].push(cellIndex);
    this.board[cellIndex] = currentSymbol;

    // Check win
    const winLine = checkWin(this.board, currentSymbol);
    if (winLine) {
      this.winner = currentSymbol;
      this.winningLine = winLine;
    } else {
      // Toggle turn
      this.turn = currentSymbol === 'X' ? 'O' : 'X';
    }

    return {
      success: true,
      placed: cellIndex,
      removed: removedIndex,
      winner: this.winner,
      winningLine: this.winningLine,
      turn: this.turn
    };
  }

  // AI Logic for computer ('O')
  getComputerMove() {
    const emptyCells = this.board.map((val, idx) => val === null ? idx : null).filter(val => val !== null);
    if (emptyCells.length === 0) return null;

    // Helper: Simulate board state after player places a mark at cellIndex
    const simulateState = (player, cellIndex) => {
      const tempBoard = [...this.board];
      const tempMoves = [...this.moves[player]];

      if (tempMoves.length >= 3) {
        const removed = tempMoves.shift();
        tempBoard[removed] = null;
      }
      tempBoard[cellIndex] = player;
      tempMoves.push(cellIndex);

      return { board: tempBoard, moves: tempMoves };
    };

    // 1. Can Computer ('O') win in this turn?
    for (const cell of emptyCells) {
      const sim = simulateState('O', cell);
      if (checkWin(sim.board, 'O')) {
        return cell;
      }
    }

    // 2. Can Opponent ('X') win in their next turn? If so, block it.
    // Note: Since it will be X's turn, we simulate what happens if X plays at cell.
    for (const cell of emptyCells) {
      const sim = simulateState('X', cell);
      if (checkWin(sim.board, 'X')) {
        return cell;
      }
    }

    // 3. Strategic heuristic weight matching
    // We score empty cells. Let's see which cell maximizes line formations.
    let bestCell = emptyCells[0];
    let bestScore = -Infinity;

    for (const cell of emptyCells) {
      let score = 0;

      // Prefer center
      if (cell === 4) score += 5;
      // Prefer corners
      else if ([0, 2, 6, 8].includes(cell)) score += 2;
      // Prefer edges
      else score += 1;

      // Evaluate how many winning combinations this cell shares with other active O marks
      const sim = simulateState('O', cell);
      // Look at remaining active marks for O
      const activeOMoves = sim.moves;
      
      for (const combo of WIN_COMBINATIONS) {
        // Count how many of O's marks are in this combo
        const oCount = combo.filter(idx => sim.board[idx] === 'O').length;
        const xCount = combo.filter(idx => sim.board[idx] === 'X').length;
        
        if (xCount === 0) {
          // Path is open for O
          if (oCount === 2) score += 8; // Creates a double threat
          if (oCount === 1) score += 3; // Establishes a line
        }
      }

      // Also try to break up X's open paths
      const xSim = simulateState('X', cell);
      for (const combo of WIN_COMBINATIONS) {
        const xCount = xSim.board.filter((val, idx) => combo.includes(idx) && val === 'X').length;
        const oCount = xSim.board.filter((val, idx) => combo.includes(idx) && val === 'O').length;
        if (oCount === 0 && xCount === 2) {
          score += 4; // Block a future dual alignment
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestCell = cell;
      }
    }

    return bestCell;
  }
}
