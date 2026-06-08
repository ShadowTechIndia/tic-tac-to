// Automated Unit Tests for Infinite Tic-Tac-Toe Logic
import { LocalGame, checkWin } from './public/js/game.js';

function runTests() {
  console.log('--- RUNNING AUTOMATED TESTS ---');

  // Test 1: Win Check Combinations
  const board1 = ['X', 'X', 'X', null, null, null, null, null, null];
  const winLine1 = checkWin(board1, 'X');
  console.assert(winLine1 !== null, 'Test 1 Failed: Win combo [0,1,2] not detected.');
  console.assert(winLine1 && winLine1.join(',') === '0,1,2', 'Test 1 Failed: Win combo array incorrect.');

  const board2 = ['O', null, null, 'O', null, null, 'O', null, null];
  const winLine2 = checkWin(board2, 'O');
  console.assert(winLine2 !== null, 'Test 1 Failed: Win combo [0,3,6] not detected.');

  // Test 2: FIFO Queue Deletion in LocalGame
  const game = new LocalGame('pass-and-play');

  // X plays: 0, 1, 2
  game.makeMove(0); // X turn -> O turn
  game.makeMove(3); // O plays 3
  game.makeMove(1); // X plays 1
  game.makeMove(4); // O plays 4
  game.makeMove(2); // X plays 2
  game.makeMove(5); // O plays 5

  // Current Board:
  // X at 0, 1, 2 (Active Marks: 3)
  // O at 3, 4, 5 (Active Marks: 3)
  console.assert(game.moves.X.length === 3, 'Test 2 Failed: X should have 3 active marks.');
  console.assert(game.moves.O.length === 3, 'Test 2 Failed: O should have 3 active marks.');
  console.assert(game.board[0] === 'X' && game.board[3] === 'O', 'Test 2 Failed: Board state mapping incorrect.');

  // X plays a 4th mark at 6.
  // Oldest mark for X was at 0, so it should be deleted.
  const res = game.makeMove(6);
  console.assert(res.success === true, 'Test 2 Failed: 4th move should be successful.');
  console.assert(res.removed === 0, 'Test 2 Failed: The oldest mark (0) was not reported as removed.');
  console.assert(game.board[0] === null, 'Test 2 Failed: The oldest mark (0) was not cleared from the board.');
  console.assert(game.board[6] === 'X', 'Test 2 Failed: New mark at 6 was not placed.');
  console.assert(game.moves.X.length === 3, 'Test 2 Failed: X should still have maximum of 3 active marks.');
  console.assert(game.moves.X.join(',') === '1,2,6', 'Test 2 Failed: X moves queue did not shift correctly.');

  // Test 3: AI Selection validation
  const aiGame = new LocalGame('vs-computer');
  // Play some moves
  aiGame.makeMove(0); // X plays 0
  aiGame.makeMove(3); // O plays 3
  aiGame.makeMove(1); // X plays 1
  
  // O (Computer) turn. It should block X's immediate win threat at 2.
  const aiMove = aiGame.getComputerMove();
  console.assert(aiMove === 2, `Test 3 Failed: AI should have blocked X at cell 2, but chose ${aiMove}.`);

  console.log('--- ALL TESTS PASSED SUCCESSFULLY! ---');
}

runTests();
