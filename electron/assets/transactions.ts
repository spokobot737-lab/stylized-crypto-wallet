import embeddedArtifact from './generated/embedded.json';
import { z } from 'zod';
import { Contract,ContractFactory,Interface,Transaction as EthTransaction,formatEther,formatUnits,getAddress,getCreateAddress,isAddress,parseEther,type TransactionRequest } from 'ethers';
import { Keypair,PublicKey,Transaction,TransactionInstruction,VersionedTransaction,SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,createTransferCheckedInstruction,getMint,unpackAccount } from '@solana/spl-token';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNoopSigner,publicKey,signerIdentity,isSome,type TransactionBuilder } from '@metaplex-foundation/umi';
import { create,createCollectionV2,fetchAsset,fetchCollection,mplCore,transfer as coreTransfer,MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import { fetchDigitalAsset,mplTokenMetadata,transferV1,TokenStandard } from '@metaplex-foundation/mpl-token-metadata';
import bs58 from 'bs58';
import collectionArtifact from './generated/collection.json';
import { chainId,display,units } from '../chains';
import { ethKey,solKey } from '../keys';
import { checkEthereum,ethereum,solana,solRpc,ERC20,ERC721,ERC1155,USDC } from './config';
import { metadataUrl } from './remote';
import type { AssetIntent,IntegrationKeys,UsdcBalance } from './types';
import type { Network } from '../types';

const chain=z.enum(['ETH','SOL','RH']),network=z.enum(['mainnet','testnet']);
const positive=z.string().regex(/^[1-9]\d{0,77}$/).refine(v=>/^[1-9]\d{0,77}$/.test(v)&&BigInt(v)<2n**256n,'Nieprawidłowa ilość.');
const uri=z.string().min(1).max(24000).refine(v=>{try{if(v.startsWith('data:application/json;base64,')){const b=Buffer.from(v.slice(29),'base64');JSON.parse(b.toString());if(v.length>24000)throw Error();}else metadataUrl(v);return true;}catch{return false;}},'Wymagany jest publiczny adres HTTPS lub IPFS.');
const name=z.string().trim().min(1).max(32);
export const intentSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('usdc'),chain:z.enum(['ETH','SOL']),network,to:z.string().max(128),amount:z.string().max(40)}).strict(),
 z.object({kind:z.literal('token'),chain:z.enum(['ETH','RH']),network,address:z.string().max(42),to:z.string().max(42),amount:z.string().max(40)}).strict(),
 z.object({kind:z.literal('nft'),chain,network,address:z.string().max(128),tokenId:z.string().regex(/^\d{1,78}$/).optional(),standard:z.enum(['ERC721','ERC1155','CORE','METAPLEX','PNFT','COMPRESSED','UNKNOWN']),to:z.string().max(128),amount:positive}).strict(),
 z.object({kind:z.literal('mint'),chain,network,creationId:z.string().uuid().optional(),mode:z.enum(['single','collection','batch']),name,symbol:z.string().trim().min(1).max(10),uri:z.string().max(24000),collection:z.string().max(128).optional(),items:z.array(z.object({name,uri}).strict()).max(20)}).strict(),
]).superRefine((v,ctx)=>{if(v.kind!=='mint')return;if(v.mode==='batch'){if(!v.collection||!v.items.length)ctx.addIssue({code:'custom',message:'Podaj istniejącą kolekcję i od 1 do 20 elementów.'});}else{if(v.items.length)ctx.addIssue({code:'custom',message:'Nieprawidłowa lista elementów.'});if(!uri.safeParse(v.uri).success)ctx.addIssue({code:'custom',message:'Wymagany jest publiczny adres metadanych HTTPS lub IPFS.'});}});
type SolPayload={kind:'sol';txs:Transaction[];extraSigners:Keypair[][];costs:bigint[];lastValidBlockHeight:number;keys:IntegrationKeys};
export type AssetPrepared={intent:AssetIntent;from:string;to:string;title:string;details:string[];fee:string;feeLabel:string;createdAddresses:string[];payload:{kind:'evm';tx:TransactionRequest}|SolPayload};
export function disposeAsset(prepared:AssetPrepared){if(prepared.payload.kind==='sol'){for(const list of prepared.payload.extraSigners)for(const signer of list)signer.secretKey.fill(0);prepared.payload.keys={};}}
export function collectionCodeMatches(code:string){let normalized=code.slice(2).toLowerCase(),expected=collectionArtifact.runtime.slice(2).toLowerCase();if(normalized.length!==expected.length)return false;for(const references of Object.values(collectionArtifact.immutableReferences))for(const {start,length} of references){normalized=normalized.slice(0,start*2)+'0'.repeat(length*2)+normalized.slice((start+length)*2);expected=expected.slice(0,start*2)+'0'.repeat(length*2)+expected.slice((start+length)*2);}return normalized===expected;}
function destination(to:string,from:string,chain:'ETH'|'SOL'|'RH'){
 if(chain!=='SOL'){if(!isAddress(to))throw new Error('Nieprawidłowy adres Ethereum.');const address=getAddress(to);if(/^0x0{40}$/i.test(address)||address.toLowerCase()===from.toLowerCase())throw new Error('Wybierz niezerowy adres inny niż własny.');return address;}
 let key:PublicKey;try{key=new PublicKey(to);}catch{throw new Error('Nieprawidłowy adres Solana.');}if(!PublicKey.isOnCurve(key.toBytes())||key.equals(SystemProgram.programId)||key.toBase58()===from)throw new Error('Wymagany jest adres portfela Solana inny niż własny.');return key.toBase58();
}
export async function usdcBalances(seed:Buffer,net:Network,keys:IntegrationKeys):Promise<UsdcBalance[]>{
 const sol=solKey(seed),addresses={ETH:ethKey(seed).address,SOL:sol.publicKey.toBase58()};sol.secretKey.fill(0);
 return Promise.all((['ETH','SOL'] as const).map(async chain=>{const result={chain,network:net,address:addresses[chain],contract:USDC[net][chain]};try{let balance:bigint;if(chain==='ETH'){const p=ethereum(net);try{await checkEthereum(p,net);const c=new Contract(result.contract,ERC20,p);if(Number(await c.decimals())!==6)throw new Error();balance=await c.balanceOf(result.address);}finally{p.destroy();}}else{const c=solana(net,keys);const mint=new PublicKey(result.contract);const data=await getMint(c,mint);if(data.decimals!==6)throw new Error();const accounts=await c.getTokenAccountsByOwner(new PublicKey(result.address),{mint});balance=accounts.value.reduce((sum,item)=>sum+unpackAccount(item.pubkey,item.account,TOKEN_PROGRAM_ID).amount,0n);}return {...result,balance:formatUnits(balance,6)};}catch{return {...result,balance:null,error:'Nie można pobrać salda USDC. Sprawdź połączenie i sieć.'};}}));
}
export async function prepareAsset(seed:Buffer,input:unknown,keys:IntegrationKeys):Promise<AssetPrepared>{
 const intent=intentSchema.parse(input) as AssetIntent;if(intent.kind==='mint'&&intent.chain==='SOL'&&(intent.uri.length>200||intent.items.some(i=>i.uri.length>200)))throw Error('Solana wymaga URI do 200 znaków.');
 if(intent.chain!=='SOL')return prepareEvm(seed,intent);
 return prepareSol(seed,intent,keys);
}
async function prepareEvm(seed:Buffer,intent:AssetIntent):Promise<AssetPrepared>{
 const from=ethKey(seed).address,p=ethereum(intent.network,intent.chain);let to=from,title='',data='',createdAddresses:string[]=[],details:string[]=[];let deployment=false;
 try{await checkEthereum(p,intent.network,intent.chain);const initialBalance=await p.getBalance(from,'pending');if(initialBalance===0n)throw Error(intent.network==='testnet'?'Brak testowych ETH na opłatę w wybranej sieci. Zasil ten adres z faucetu tej sieci.':'Za mało ETH na opłatę w wybranej sieci.');
  if(intent.kind==='usdc'||intent.kind==='token'){
   to=destination(intent.to,from,'ETH');const contract=intent.kind==='token'?getAddress(intent.address):USDC[intent.network].ETH,token=new Contract(contract,ERC20,p),decimals=Number(await token.decimals());if(!Number.isInteger(decimals)||decimals<0||decimals>36||intent.kind==='usdc'&&decimals!==6)throw Error('Nieprawidłowa precyzja tokena.');const amount=units(intent.amount,decimals);if(await token.balanceOf(from)<amount)throw Error('Za mało tokenów.');if(await token.transfer.staticCall(to,amount,{from})!==true)throw Error('Kontrakt odrzucił transfer.');data=new Interface(ERC20).encodeFunctionData('transfer',[to,amount]);title=`Wyślij ${formatUnits(amount,decimals)} ${intent.kind==='usdc'?'USDC':'ERC-20'}`;details=[`Odbiorca: ${to}`,`Kontrakt: ${contract}`,`Sieć: ${intent.chain} ${intent.network}`];
  }else if(intent.kind==='nft'){
   to=destination(intent.to,from,'ETH');if(!isAddress(intent.address)||!intent.tokenId)throw new Error('Podaj kontrakt i identyfikator NFT.');const address=getAddress(intent.address);const tokenId=BigInt(intent.tokenId);if(tokenId>=2n**256n)throw new Error('Nieprawidłowy identyfikator NFT.');
   if(intent.standard==='ERC721'){if(intent.amount!=='1')throw new Error('ERC-721 wymaga ilości 1.');const c=new Contract(address,ERC721,p);if(!await c.supportsInterface('0x80ac58cd')||(await c.ownerOf(tokenId)).toLowerCase()!==from.toLowerCase())throw new Error('Aktywny portfel nie jest właścicielem tego NFT ERC-721.');data=new Interface(ERC721).encodeFunctionData('safeTransferFrom',[from,to,tokenId]);}
   else if(intent.standard==='ERC1155'){const c=new Contract(address,ERC1155,p);if(!await c.supportsInterface('0xd9b67a26')||await c.balanceOf(from,tokenId)<BigInt(intent.amount))throw new Error('Za mało NFT ERC-1155 w aktywnym portfelu.');data=new Interface(ERC1155).encodeFunctionData('safeTransferFrom',[from,to,tokenId,BigInt(intent.amount),'0x']);}else throw new Error('Wybierz obsługiwany standard NFT Ethereum.');
   title=`Wyślij NFT #${intent.tokenId}`;details=[`Odbiorca: ${to}`,`Kontrakt: ${address}`,`Ilość: ${intent.amount}`,`Standard: ${intent.standard}`];
  }else{
   const entries=intent.mode==='single'?[{name:intent.name,uri:intent.uri}]:intent.items;
   if(intent.mode==='batch'){
    if(!isAddress(intent.collection!))throw new Error('Nieprawidłowy adres kolekcji.');to=getAddress(intent.collection!);if(!collectionCodeMatches(await p.getCode(to)))throw new Error('Mintowanie zbiorcze obsługuje kolekcje utworzone w FRAME.');const c=new Contract(to,collectionArtifact.abi,p);if((await c.owner()).toLowerCase()!==from.toLowerCase())throw new Error('Aktywny portfel nie zarządza tą kolekcją.');data=c.interface.encodeFunctionData('mintMany',[entries.map(item=>item.uri)]);title=`Utwórz NFT w kolekcji (${entries.length})`;
   }else{const artifact=intent.uri.startsWith('data:')?embeddedArtifact:collectionArtifact;const factory=new ContractFactory(artifact.abi,artifact.bytecode);data=String((await factory.getDeployTransaction(intent.name,intent.symbol,intent.mode==='single'?1:10000,intent.uri,entries.map(item=>item.uri))).data);deployment=true;title=intent.mode==='collection'?'Utwórz kolekcję Ethereum':'Utwórz NFT Ethereum';}
   details=[`Nazwa: ${intent.name}`,`Symbol: ${intent.symbol}`,`Liczba NFT: ${entries.length}`,...entries.map((item,i)=>`${i+1}. ${item.name}: ${item.uri}`)];if(intent.mode==='collection')details.push(`Metadane: ${intent.uri}`,'Pusta kolekcja; NFT dodasz w trybie seryjnym. Limit podaży: 10000.');
  }
  const contractTarget=deployment?undefined:intent.kind==='usdc'?USDC[intent.network].ETH:(intent.kind==='nft'||intent.kind==='token')?getAddress(intent.address):to;
  if(contractTarget&&await p.getCode(contractTarget)==='0x')throw new Error('Nie znaleziono kontraktu w wybranej sieci.');
  const [estimate,feeData,nonce,balance]=await Promise.all([p.estimateGas({from,to:contractTarget,data,value:0n}),p.getFeeData(),p.getTransactionCount(from,'pending'),p.getBalance(from,'pending')]);
  if(!feeData.maxFeePerGas||feeData.maxPriorityFeePerGas===null)throw new Error('Brak danych opłaty EIP-1559.');const gasLimit=estimate*125n/100n,fee=gasLimit*feeData.maxFeePerGas;if(fee>parseEther('0.05'))throw new Error('Opłata przekracza limit bezpieczeństwa 0,05 ETH.');if(balance<fee)throw new Error('Za mało ETH na opłatę.');if(deployment){to=getCreateAddress({from,nonce});createdAddresses=[to];details.push(`Adres kolekcji: ${to}`);}
  return {intent,from,to,title,details,fee:formatEther(fee),feeLabel:'Maksymalna opłata ETH',createdAddresses,payload:{kind:'evm',tx:{to:contractTarget,data,value:0n,nonce,chainId:chainId(intent.network,intent.chain),type:2,gasLimit,maxFeePerGas:feeData.maxFeePerGas,maxPriorityFeePerGas:feeData.maxPriorityFeePerGas}}};
 }finally{p.destroy();}
}
export function umiInstructions(builder:TransactionBuilder){return builder.getInstructions().map(ix=>new TransactionInstruction({programId:new PublicKey(ix.programId),keys:ix.keys.map(key=>({...key,pubkey:new PublicKey(key.pubkey)})),data:Buffer.from(ix.data)}));}
async function prepareSol(seed:Buffer,intent:AssetIntent,keys:IntegrationKeys):Promise<AssetPrepared>{
 const key=solKey(seed),owner=key.publicKey,from=owner.toBase58();key.secretKey.fill(0);const c=solana(intent.network,keys),umi=createUmi(solRpc(intent.network,keys)).use(mplCore()).use(mplTokenMetadata()).use(signerIdentity(createNoopSigner(publicKey(from))));
 const txs:Transaction[]=[],extraSigners:Keypair[][]=[],createdAddresses:string[]=[];let title='',to=from,details:string[]=[];
 try{
  if(intent.kind==='token')throw Error('Token ERC-20 wymaga sieci EVM.');
  if(intent.kind==='usdc'){
   to=destination(intent.to,from,'SOL');const value=units(intent.amount,6),mint=new PublicKey(USDC[intent.network].SOL),mintInfo=await getMint(c,mint);if(mintInfo.decimals!==6)throw new Error('Nieprawidłowa precyzja tokena USDC.');const destinationKey=new PublicKey(to),ata=getAssociatedTokenAddressSync(mint,destinationKey);const tx=new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(owner,ata,destinationKey,mint));let remaining=value;const accounts=await c.getTokenAccountsByOwner(owner,{mint});
   for(const item of accounts.value){const account=unpackAccount(item.pubkey,item.account,TOKEN_PROGRAM_ID);if(account.isFrozen||!account.owner.equals(owner)||account.amount===0n)continue;const spend=remaining<account.amount?remaining:account.amount;tx.add(createTransferCheckedInstruction(item.pubkey,mint,ata,owner,spend,6));remaining-=spend;if(remaining===0n)break;}
   if(remaining>0n)throw new Error('Za mało dostępnych USDC.');txs.push(tx);extraSigners.push([]);title=`Wyślij ${formatUnits(value,6)} USDC`;details=[`Odbiorca: ${to}`,`USDC: ${mint.toBase58()}`];
  }else if(intent.kind==='nft'){
   to=destination(intent.to,from,'SOL');if(intent.amount!=='1')throw new Error('NFT Solana wymaga ilości 1.');const address=new PublicKey(intent.address),raw=await c.getAccountInfo(address);if(!raw)throw new Error('NFT nie istnieje w wybranej sieci.');let builder:TransactionBuilder;
   if(raw.owner.toBase58()===MPL_CORE_PROGRAM_ID){const asset=await fetchAsset(umi,publicKey(address.toBase58()));if(asset.owner!==from)throw new Error('Aktywny portfel nie jest właścicielem tego NFT.');const collection=asset.updateAuthority.type==='Collection'?await fetchCollection(umi,asset.updateAuthority.address!):undefined;builder=coreTransfer(umi,{asset,collection,newOwner:publicKey(to)});}
   else{
    const mint=await getMint(c,address);if(mint.decimals!==0||mint.supply!==1n)throw new Error('To nie jest obsługiwany NFT Solana.');const digital=await fetchDigitalAsset(umi,publicKey(address.toBase58()));const standard=isSome(digital.metadata.tokenStandard)?digital.metadata.tokenStandard.value:TokenStandard.NonFungible;
    if(![TokenStandard.NonFungible,TokenStandard.NonFungibleEdition,TokenStandard.ProgrammableNonFungible,TokenStandard.ProgrammableNonFungibleEdition].includes(standard))throw new Error('Nieobsługiwany standard NFT Solana.');const accounts=await c.getTokenAccountsByOwner(owner,{mint:address});const token=accounts.value.find(item=>{const a=unpackAccount(item.pubkey,item.account);return a.amount===1n&&a.owner.equals(owner);});if(!token)throw new Error('Aktywny portfel nie jest właścicielem tego NFT.');
    const config=digital.metadata.programmableConfig;const authorizationRules=isSome(config)&&isSome(config.value.ruleSet)?config.value.ruleSet.value:undefined;
    builder=transferV1(umi,{mint:publicKey(address.toBase58()),token:publicKey(token.pubkey.toBase58()),tokenOwner:publicKey(from),destinationOwner:publicKey(to),tokenStandard:standard,authorizationRules});
   }
   txs.push(new Transaction().add(...umiInstructions(builder)));extraSigners.push([]);title='Wyślij NFT Solana';details=[`NFT: ${address.toBase58()}`,`Odbiorca: ${to}`];
  }else{
   title=intent.mode==='collection'?'Utwórz kolekcję Solana':`Utwórz NFT Solana (${intent.mode==='batch'?intent.items.length:1})`;
   if(intent.mode==='collection'){
    const asset=Keypair.generate();createdAddresses.push(asset.publicKey.toBase58());const builder=createCollectionV2(umi,{collection:createNoopSigner(publicKey(asset.publicKey.toBase58())),name:intent.name,uri:intent.uri,updateAuthority:publicKey(from)});txs.push(new Transaction().add(...umiInstructions(builder)));extraSigners.push([asset]);details=[`Nazwa: ${intent.name}`,`Metadane: ${intent.uri}`,'Pusta kolekcja; NFT dodasz w trybie seryjnym.'];
   }else{
    const collection=intent.collection?await fetchCollection(umi,publicKey(new PublicKey(intent.collection).toBase58())):undefined;if(collection&&collection.updateAuthority!==from)throw new Error('Aktywny portfel nie zarządza tą kolekcją.');
    const entries=intent.mode==='single'?[{name:intent.name,uri:intent.uri}]:intent.items;
    for(const item of entries){const asset=Keypair.generate();createdAddresses.push(asset.publicKey.toBase58());const builder=create(umi,{asset:createNoopSigner(publicKey(asset.publicKey.toBase58())),name:item.name,uri:item.uri,owner:publicKey(from),collection});txs.push(new Transaction().add(...umiInstructions(builder)));extraSigners.push([asset]);details.push(`${item.name}: ${item.uri}`);}
    if(intent.collection)details.unshift(`Kolekcja: ${intent.collection}`);
   }
  }
  const initial=await c.getLatestBlockhash('confirmed'),balance=await c.getBalance(owner,'confirmed'),costs:bigint[]=[];
  for(const tx of txs){tx.feePayer=owner;tx.recentBlockhash=initial.blockhash;if(tx.serialize({verifySignatures:false,requireAllSignatures:false}).length>1232)throw new Error('Transakcja jest zbyt duża. Skróć adresy metadanych lub zmniejsz serię.');
   const simulation=await c.simulateTransaction(new VersionedTransaction(tx.compileMessage()),{sigVerify:false,replaceRecentBlockhash:true,commitment:'confirmed',accounts:{encoding:'base64',addresses:[from]}});if(simulation.value.err)throw new Error('Symulacja Solana odrzuciła operację. Sprawdź saldo, własność i ograniczenia NFT.');const after=simulation.value.accounts?.[0]?.lamports;if(after===undefined||!Number.isSafeInteger(after))throw new Error('Nie można oszacować kosztu Solana.');const fee=(await c.getFeeForMessage(tx.compileMessage(),'confirmed')).value;if(fee===null)throw new Error('Brak danych opłaty Solana.');const spent=Math.max(0,balance-after);costs.push(BigInt(spent)+BigInt(fee)+10000n);
  }
  const total=costs.reduce((a,b)=>a+b,0n);if(total>1000000000n)throw new Error('Koszt przekracza limit bezpieczeństwa 1 SOL.');if(BigInt(balance)<total)throw new Error('Za mało SOL na opłaty i utworzenie kont.');const latest=await c.getLatestBlockhash('confirmed');for(const tx of txs)tx.recentBlockhash=latest.blockhash;
  return {intent,from,to,title,details,fee:display(total,9),feeLabel:'Maksymalny koszt SOL z rezerwą i utworzeniem kont',createdAddresses,payload:{kind:'sol',txs,extraSigners,costs,lastValidBlockHeight:latest.lastValidBlockHeight,keys:{helius:keys.helius}}};
 }catch(e){for(const list of extraSigners)for(const signer of list)signer.secretKey.fill(0);throw e;}
}
// Ponowna symulacja nie zmienia zatwierdzonej transakcji ani limitu opłaty.
export async function revalidateAsset(prepared:AssetPrepared){
 if(prepared.payload.kind==='evm'){
  const p=ethereum(prepared.intent.network,prepared.intent.chain),tx=prepared.payload.tx;
  try{await checkEthereum(p,prepared.intent.network,prepared.intent.chain);const [nonce,balance,result,estimate]=await Promise.all([p.getTransactionCount(prepared.from,'pending'),p.getBalance(prepared.from,'pending'),p.call({...tx,from:prepared.from}),p.estimateGas({...tx,from:prepared.from})]);
   if(nonce!==tx.nonce||balance<BigInt(tx.gasLimit!)*BigInt(tx.maxFeePerGas!)||estimate>BigInt(tx.gasLimit!))throw new Error('Stan konta lub opłata uległy zmianie. Przygotuj operację ponownie.');
   if((prepared.intent.kind==='usdc'||prepared.intent.kind==='token')&&new Interface(ERC20).decodeFunctionResult('transfer',result)[0]!==true)throw new Error('Kontrakt USDC odrzucił transfer.');
  }finally{p.destroy();}return;
 }
 const payload=prepared.payload,c=solana(prepared.intent.network,payload.keys),balance=await c.getBalance(new PublicKey(prepared.from),'confirmed');
 if(await c.getBlockHeight('confirmed')>payload.lastValidBlockHeight||BigInt(balance)<payload.costs.reduce((a,b)=>a+b,0n))throw new Error('Wycena Solana wygasła lub zmieniło się saldo. Przygotuj operację ponownie.');
 for(let i=0;i<payload.txs.length;i++){
  const simulation=await c.simulateTransaction(new VersionedTransaction(payload.txs[i].compileMessage()),{sigVerify:false,replaceRecentBlockhash:true,commitment:'confirmed',accounts:{encoding:'base64',addresses:[prepared.from]}}),after=simulation.value.accounts?.[0]?.lamports;
  const fee=(await c.getFeeForMessage(payload.txs[i].compileMessage(),'confirmed')).value;
  if(simulation.value.err||after===undefined||!Number.isSafeInteger(after)||fee===null||BigInt(Math.max(0,balance-after))+BigInt(fee)>payload.costs[i])throw new Error('Stan NFT, saldo lub koszt uległy zmianie. Przygotuj operację ponownie.');
 }
}
export async function signAsset(seed:Buffer,prepared:AssetPrepared):Promise<{raw:string;hash:string}[]>{
 if(prepared.payload.kind==='evm'){const raw=await ethKey(seed).signTransaction(prepared.payload.tx);return [{raw,hash:EthTransaction.from(raw).hash!}];}
 const key=solKey(seed);try{return prepared.payload.txs.map((tx,index)=>{tx.sign(key,...(prepared.payload as SolPayload).extraSigners[index]);return {raw:tx.serialize().toString('base64'),hash:bs58.encode(tx.signature!)};});}finally{key.secretKey.fill(0);}
}
export async function broadcastAsset(prepared:AssetPrepared,signed:{raw:string;hash:string},index:number){
 if(prepared.payload.kind==='evm'){const p=ethereum(prepared.intent.network,prepared.intent.chain);try{await checkEthereum(p,prepared.intent.network,prepared.intent.chain);if((await p.broadcastTransaction(signed.raw)).hash!==signed.hash)throw new Error('Niezgodny hash.');}finally{p.destroy();}return;}
 const c=solana(prepared.intent.network,prepared.payload.keys);if(await c.getBlockHeight('confirmed')>prepared.payload.lastValidBlockHeight)throw new Error('Wycena Solana wygasła.');const tx=prepared.payload.txs[index];if(await c.sendRawTransaction(Buffer.from(signed.raw,'base64'),{skipPreflight:false,maxRetries:3})!==signed.hash)throw new Error('Niezgodny hash.');
 const confirmation=await c.confirmTransaction({signature:signed.hash,blockhash:tx.recentBlockhash!,lastValidBlockHeight:prepared.payload.lastValidBlockHeight},'confirmed');if(confirmation.value.err)throw new Error('Operacja Solana nie została wykonana.');
}
