import { Connection, PublicKey, SystemProgram, Transaction as SolTransaction } from '@solana/web3.js';
import { JsonRpcProvider, FetchRequest, parseEther, formatEther, isAddress, getAddress, Transaction as EthTransaction } from 'ethers';
import { Psbt, Transaction, address, payments, initEccLib } from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { accounts, btcKey, btcNetwork, ethKey, solKey } from './keys';
import type { Chain, Network, Balance } from './types';
initEccLib(ecc);
export const endpoints = {
 mainnet:{SOL:'https://api.mainnet-beta.solana.com',RH:'https://rpc.mainnet.chain.robinhood.com',ETH:'https://ethereum-rpc.publicnode.com',BTC:'https://blockstream.info/api'},
 testnet:{SOL:'https://api.devnet.solana.com',RH:'https://rpc.testnet.chain.robinhood.com',ETH:'https://ethereum-sepolia-rpc.publicnode.com',BTC:'https://blockstream.info/testnet/api'},
};
export const chainId = (n: Network,chain:string='ETH') => chain==='RH'?(n==='mainnet'?4663n:46630n):(n==='mainnet'?1n:11155111n);
export function units(text: string, decimals: number): bigint {
 if(!Number.isInteger(decimals)||decimals<0||decimals>36)throw Error('Nieprawidłowa precyzja aktywa.');
 if (!(decimals===0?/^(0|[1-9][0-9]{0,15})$/:new RegExp(`^(0|[1-9][0-9]{0,15})(\\.[0-9]{1,${decimals}})?$`)).test(text)) throw new Error(`Nieprawidłowa kwota. Maksymalnie ${decimals} miejsc po przecinku.`);
 const [whole,frac='']=text.split('.'); const value=BigInt(whole)*10n**BigInt(decimals)+BigInt(frac.padEnd(decimals,'0'));
 if(value<=0n) throw new Error('Kwota musi być większa od zera.'); return value;
}
export function display(value: bigint, decimals: number) { if(decimals===0)return value.toString(); const s=value.toString().padStart(decimals+1,'0'); return `${s.slice(0,-decimals)}.${s.slice(-decimals)}`.replace(/\.?0+$/,''); }
async function request(url: string, init?: RequestInit) { const response=await fetch(url,{...init,signal:AbortSignal.timeout(20000)}); if(!response.ok) throw new Error(`Węzeł zwrócił HTTP ${response.status}. Spróbuj później.`); return response; }
const solConnection = (n:Network) => new Connection(endpoints[n].SOL,{commitment:'confirmed',fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})});
function ethProvider(n:Network,chain:'ETH'|'RH'='ETH') { const request=new FetchRequest(endpoints[n][chain]);request.timeout=20000;return new JsonRpcProvider(request,undefined,{batchMaxCount:1}); }
export async function balances(seed:Buffer, network:Network): Promise<Balance[]> {
 return Promise.all(accounts(seed,network).map(async account=>{
  try {
   let balance:string;
   if(account.chain==='SOL') balance=display(BigInt(await solConnection(network).getBalance(new PublicKey(account.address))),9);
   else if(account.chain==='ETH') { const p=ethProvider(network); try { if((await p.getNetwork()).chainId!==chainId(network)) throw new Error('Niezgodna sieć RPC.'); balance=formatEther(await p.getBalance(account.address)); } finally {p.destroy();} }
   else { const data=await (await request(`${endpoints[network].BTC}/address/${account.address}`)).json(); const confirmed=BigInt(data.chain_stats.funded_txo_sum)-BigInt(data.chain_stats.spent_txo_sum); const pending=BigInt(data.mempool_stats.funded_txo_sum)-BigInt(data.mempool_stats.spent_txo_sum); balance=display(confirmed+pending,8); }
   return {...account,balance};
  } catch(e) {return {...account,balance:null,error:e instanceof Error?e.message:'Brak połączenia z siecią.'};}
 }));
}
export type Prepared = { chain:Chain; network:Network; to:string; amount:string; from:string; fee:string; feeLabel:string; payload:unknown };
export function selectCoins(utxos:{txid:string;vout:number;value:number}[],amount:bigint,rate:number) {
 if(!Number.isFinite(rate)||rate<1||rate>1000) throw new Error('Nieprawidłowa stawka BTC (1–1000 sat/vB).');
 const chosen:typeof utxos=[];let total=0n;
 for(const utxo of [...utxos].sort((a,b)=>b.value-a.value)){
  if(!/^[a-f0-9]{64}$/.test(utxo.txid)||!Number.isSafeInteger(utxo.value)||utxo.value<=0||!Number.isInteger(utxo.vout)||utxo.vout<0) throw new Error('Nieprawidłowy UTXO z API.');
  chosen.push(utxo);total+=BigInt(utxo.value);
  // Conservative P2WPKH estimate, two outputs (destination may use a larger script).
  const fee=BigInt(Math.ceil((12+chosen.length*69+2*43)*rate));
  if(total>=amount+fee){ const change=total-amount-fee; return {chosen,total,fee:change>=294n?fee:total-amount,change:change>=294n?change:0n}; }
  if(chosen.length>=100) throw new Error('Zbyt wiele wejść. Skonsoliduj UTXO.');
 }
 throw new Error('Za mało potwierdzonych BTC na kwotę i opłatę.');
}
export async function prepare(seed:Buffer, chain:Chain, network:Network,to:string,amount:string):Promise<Prepared>{
 const account=accounts(seed,network).find(a=>a.chain===(chain==='RH'?'ETH':chain))!;
 if(chain==='SOL'){
  const value=units(amount,9); if(value>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Kwota przekracza obsługiwany zakres SOL.');
  const recipient=new PublicKey(to); if(!PublicKey.isOnCurve(recipient.toBytes())) throw new Error('W tej wersji wysyłaj SOL tylko na zwykłe adresy portfeli.');
  const connection=solConnection(network); const latest=await connection.getLatestBlockhash();
  const tx=new SolTransaction({feePayer:new PublicKey(account.address),...latest}).add(SystemProgram.transfer({fromPubkey:new PublicKey(account.address),toPubkey:recipient,lamports:value}));
  const fee=(await connection.getFeeForMessage(tx.compileMessage())).value; if(fee===null) throw new Error('Nie udało się wycenić opłaty SOL.');
  if(BigInt(await connection.getBalance(tx.feePayer!))<value+BigInt(fee)) throw new Error('Za mało SOL na kwotę i opłatę.');
  const recipientInfo=await connection.getAccountInfo(recipient);
  if(!recipientInfo&&value<BigInt(await connection.getMinimumBalanceForRentExemption(0))) throw new Error('Kwota jest za mała na utworzenie nowego konta SOL (rent exemption).');
  return {chain,network,to:recipient.toBase58(),amount,from:account.address,fee:display(BigInt(fee),9),feeLabel:'opłata sieciowa',payload:{tx,latest}};
 }
 if(chain==='ETH'||chain==='RH'){
  if(!isAddress(to)) throw new Error('Nieprawidłowy adres Ethereum.'); const recipient=getAddress(to); if(recipient==='0x0000000000000000000000000000000000000000') throw new Error('Adres zerowy jest zablokowany.');
  const value=units(amount,18),p=ethProvider(network,chain);
  try{
   if((await p.getNetwork()).chainId!==chainId(network,chain)) throw new Error('Niezgodna sieć RPC.');
   if(await p.getCode(recipient)!=='0x') throw new Error('Ta wersja obsługuje przelewy ETH na zwykłe konta, bez wywoływania kontraktów.');
   const [gasEstimate,feeData,nonce,balance]=await Promise.all([p.estimateGas({from:account.address,to:recipient,value}),p.getFeeData(),p.getTransactionCount(account.address,'pending'),p.getBalance(account.address,'pending')]);
   if(!feeData.maxFeePerGas||feeData.maxPriorityFeePerGas===null) throw new Error('Brak danych opłaty EIP-1559.');
   const gasLimit=gasEstimate*120n/100n;const fee=gasLimit*feeData.maxFeePerGas;
   if(fee>parseEther('0.05')) throw new Error('Opłata przekracza limit bezpieczeństwa 0,05 ETH.');
   if(balance<value+fee) throw new Error('Za mało ETH na kwotę i maksymalną opłatę.');
   return {chain,network,to:recipient,amount,from:account.address,fee:formatEther(fee),feeLabel:'maks. opłata (EIP-1559)',payload:{to:recipient,value,chainId:chainId(network,chain),nonce,type:2,gasLimit,maxFeePerGas:feeData.maxFeePerGas,maxPriorityFeePerGas:feeData.maxPriorityFeePerGas}};
  }finally{p.destroy();}
 }
 const value=units(amount,8); if(value<546n) throw new Error('Minimum odbiorcy: 546 satoshi.');
 const net=btcNetwork(network); const destination=address.toOutputScript(to,net);
 if(to===account.address) throw new Error('Wybierz adres inny niż własny.');
 const [allUtxos,rates]=await Promise.all([(await request(`${endpoints[network].BTC}/address/${account.address}/utxo`)).json(),(await request(`${endpoints[network].BTC}/fee-estimates`)).json()]);
 const rate=Math.max(1,Math.ceil(Number(rates['3']??rates['6']))); const selection=selectCoins(allUtxos.filter((u:any)=>u.status?.confirmed===true),value,rate);
 if(selection.fee>1_000_000n) throw new Error('Opłata przekracza limit bezpieczeństwa 0,01 BTC.');
 const key=btcKey(seed,network); const ownScript=payments.p2wpkh({pubkey:key.publicKey,network:net}).output!;
 const psbt=new Psbt({network:net,maximumFeeRate:1000});
 for(const u of selection.chosen){
  // Independently verify each previous transaction: never trust an API-provided UTXO value/script.
  const raw=await (await request(`${endpoints[network].BTC}/tx/${u.txid}/hex`)).text();const previous=Transaction.fromHex(raw);
  const output=previous.outs[u.vout];
  if(previous.getId()!==u.txid||!output||output.value!==BigInt(u.value)||!Buffer.from(output.script).equals(Buffer.from(ownScript))) throw new Error('UTXO nie zgadza się z poprzednią transakcją.');
  psbt.addInput({hash:u.txid,index:u.vout,sequence:0xfffffffd,witnessUtxo:{script:output.script,value:output.value},nonWitnessUtxo:previous.toBuffer()});
 }
 psbt.addOutput({script:destination,value});if(selection.change>0n)psbt.addOutput({script:ownScript,value:selection.change});
 return {chain,network,to,amount,from:account.address,fee:display(selection.fee,8),feeLabel:`${rate} sat/vB · ${selection.chosen.length} wejść`,payload:psbt};
}
export async function revalidateNative(prepared:Prepared){if(prepared.chain!=='ETH'&&prepared.chain!=='RH')return;const p=ethProvider(prepared.network,prepared.chain),tx=prepared.payload as any;try{if((await p.getNetwork()).chainId!==chainId(prepared.network,prepared.chain))throw Error('Niezgodna sieć RPC.');const [nonce,balance,estimate,code]=await Promise.all([p.getTransactionCount(prepared.from,'pending'),p.getBalance(prepared.from,'pending'),p.estimateGas({...tx,from:prepared.from}),p.getCode(prepared.to)]);if(nonce!==tx.nonce||balance<BigInt(tx.value)+BigInt(tx.gasLimit)*BigInt(tx.maxFeePerGas)||estimate>BigInt(tx.gasLimit)||code!=='0x')throw Error('Saldo, opłata lub odbiorca zmieniły się. Przygotuj przelew ponownie.');}finally{p.destroy();}}
export async function sign(seed:Buffer,prepared:Prepared):Promise<{raw:string;hash:string}>{
 if(prepared.chain==='SOL'){
  const {tx}=prepared.payload as {tx:SolTransaction};const key=solKey(seed);try{tx.sign(key);const raw=tx.serialize(); const bs58=(await import('bs58')).default;return {raw:raw.toString('base64'),hash:bs58.encode(tx.signature!)};}finally{key.secretKey.fill(0);}
 }
 if(prepared.chain==='ETH'||prepared.chain==='RH'){const raw=await ethKey(seed).signTransaction(prepared.payload as any);return {raw,hash:EthTransaction.from(raw).hash!};}
 const psbt=prepared.payload as Psbt;const key=btcKey(seed,prepared.network);psbt.signAllInputs(key);
 if(!psbt.validateSignaturesOfAllInputs((pub,hash,sig)=>ecc.verify(hash,pub,sig)))throw new Error('Nieprawidłowy podpis BTC.');
 psbt.finalizeAllInputs();const tx=psbt.extractTransaction();const actual=psbt.getFee();if(actual!==units(prepared.fee,8))throw new Error('Niezgodna opłata BTC.');
 return {raw:tx.toHex(),hash:tx.getId()};
}
export async function broadcast(prepared:Prepared,signed:{raw:string;hash:string}){
 if(prepared.chain==='SOL')return solConnection(prepared.network).sendRawTransaction(Buffer.from(signed.raw,'base64'),{skipPreflight:false,maxRetries:3});
 if(prepared.chain==='ETH'||prepared.chain==='RH'){const p=ethProvider(prepared.network,prepared.chain==='RH'?'RH':'ETH');try{if((await p.getNetwork()).chainId!==chainId(prepared.network,prepared.chain))throw new Error('Niezgodna sieć RPC.');return (await p.broadcastTransaction(signed.raw)).hash;}finally{p.destroy();}}
 return (await (await request(`${endpoints[prepared.network].BTC}/tx`,{method:'POST',headers:{'Content-Type':'text/plain'},body:signed.raw})).text()).trim();
}
export function explorer(chain:Chain,network:Network,hash:string){
 if(chain==='SOL'){if(!/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(hash))throw new Error('Nieprawidłowy hash.');return `https://explorer.solana.com/tx/${hash}${network==='testnet'?'?cluster=devnet':''}`;}
 if(!/^(0x)?[a-fA-F0-9]{64}$/.test(hash))throw new Error('Nieprawidłowy hash.');
 if(chain==='RH')return `https://${network==='mainnet'?'robinhoodchain.blockscout.com':'explorer.testnet.chain.robinhood.com'}/tx/${hash}`;
 if(chain==='ETH')return `https://${network==='testnet'?'sepolia.':''}etherscan.io/tx/${hash}`;
 return `https://blockstream.info/${network==='testnet'?'testnet/':''}tx/${hash}`;
}
