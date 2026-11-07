import {ai} from 'js-chess-engine';
import {Chess,type Square} from 'chess.js';
import {CHESS_LEVELS,type Difficulty} from './chess-config';
export function engineMove(fen:string,difficulty:Difficulty,depth:number){const game=new Chess(fen);if(game.isGameOver())return;const config=CHESS_LEVELS[difficulty],result=ai(fen,{level:config.level,play:false,ttSizeMB:1,depth:{base:Math.min(depth,config.depth),extended:Math.min(depth,config.depth),check:false,quiescence:1}}),entry=Object.entries(result.move)[0];if(!entry)throw Error('Silnik nie zwrócił ruchu.');const [from,to]=entry;const move={from:from.toLowerCase() as Square,to:to.toLowerCase() as Square,promotion:'q'};game.move(move);return move;}
