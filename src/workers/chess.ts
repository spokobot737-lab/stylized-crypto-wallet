import {engineMove} from '../../shared/chess-engine';
import {CHESS_LEVELS,type Difficulty} from '../../shared/chess-config';
self.onmessage=({data}:{data:{id:number;fen:string;difficulty:Difficulty}})=>{try{const config=CHESS_LEVELS[data.difficulty];for(let depth=1;depth<=config.depth;depth++){const move=engineMove(data.fen,data.difficulty,depth);self.postMessage({id:data.id,fen:data.fen,move,done:depth===config.depth});}}catch(e){self.postMessage({id:data.id,fen:data.fen,error:(e as Error).message});}};
