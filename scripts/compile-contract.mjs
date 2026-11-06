import solc from 'solc';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
for (const [file,artifactName,contractName] of [['contracts/FrameCollection.sol','collection','FrameCollection'],['contracts/FrameEmbeddedCollection.sol','embedded','FrameEmbeddedCollection']]) {
const input={language:'Solidity',sources:{[file]:{content:readFileSync(file,'utf8')}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}};
const output=JSON.parse(solc.compile(JSON.stringify(input),{import:path=>{try{if(!path.startsWith('@openzeppelin/contracts/')||path.includes('..'))throw Error();return {contents:readFileSync(resolve('node_modules',path),'utf8')};}catch{return {error:'Nie znaleziono zależności kontraktu.'};}}}));
if(output.errors?.some(e=>e.severity==='error'))throw Error(output.errors.map(e=>e.formattedMessage).join('\n'));
const contract=output.contracts[file][contractName];
mkdirSync('electron/assets/generated',{recursive:true});
writeFileSync(`electron/assets/generated/${artifactName}.json`,JSON.stringify({compiler:solc.version(),abi:contract.abi,bytecode:'0x'+contract.evm.bytecode.object,runtime:'0x'+contract.evm.deployedBytecode.object,immutableReferences:contract.evm.deployedBytecode.immutableReferences},null,2)+'\n');
console.log('Skompilowano kontrakt kolekcji FRAME.');

}
