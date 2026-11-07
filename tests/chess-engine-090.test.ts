import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {engineMove} from '../shared/chess-engine';
import {CHESS_LEVELS,type Difficulty} from '../shared/chess-config';
for(const difficulty of Object.keys(CHESS_LEVELS)as Difficulty[])test(`bundled offline chess ${difficulty}: legal response in opening and promotion`,{timeout:30000},()=>{for(const fen of [new Chess().fen(),'4k3/P7/8/8/8/8/7p/4K3 w - - 0 1']){const game=new Chess(fen),move=engineMove(fen,difficulty,CHESS_LEVELS[difficulty].depth);assert(move);assert.doesNotThrow(()=>game.move(move));assert.notEqual(game.fen(),fen);}});
test('engine does not move after mate/stalemate',()=>{assert.equal(engineMove('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1','hard',1),undefined);assert.equal(engineMove('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1','easy',1),undefined);});
