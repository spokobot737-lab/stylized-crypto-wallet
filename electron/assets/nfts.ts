import { z } from 'zod';
import { Contract, getAddress, isAddress } from 'ethers';
import { PublicKey } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { fetchAsset, mplCore } from '@metaplex-foundation/mpl-core';
import { fetchDigitalAsset, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import { apiJson, ethereum, checkEthereum, ERC721, ERC1155, solRpc } from './config';
import { metadataUrl, remoteMetadata,resolveMediaUri } from './remote';
import type { IntegrationKeys,Nft,NftPage,NftQuery,NftStandard } from './types';

export const nftQuerySchema=z.object({chain:z.enum(['ETH','SOL']),network:z.enum(['mainnet','testnet']),mode:z.enum(['owned','explore']),scope:z.enum(['asset','collection']).optional(),query:z.string().trim().max(128).optional(),tokenId:z.string().regex(/^\d{1,78}$/).optional(),cursor:z.string().max(2048).optional()}).strict();
const text=(v:unknown,length=160)=>typeof v==='string'?v.slice(0,length):'';
const uri=(v:unknown)=>{try{return resolveMediaUri(text(v,1200000));}catch{return undefined;}};
export function alchemyNft(raw:any,network:NftQuery['network']):Nft{
 if(!isAddress(raw?.contract?.address)||!/^\d{1,78}$/.test(String(raw.tokenId)))throw new Error('Nieprawidłowa odpowiedź indeksu NFT.');
 const address=getAddress(raw.contract.address),standard:NftStandard=['ERC721','ERC1155'].includes(raw.tokenType)?raw.tokenType:'UNKNOWN';
 return {id:`ETH:${network}:${address.toLowerCase()}:${raw.tokenId}`,chain:'ETH',network,address,tokenId:String(raw.tokenId),standard,name:text(raw.name)||`NFT #${raw.tokenId}`,description:text(raw.description,1000),image:uri(raw.image?.cachedUrl||raw.image?.originalUrl||raw.raw?.metadata?.image||raw.raw?.metadata?.image_url),uri:uri(raw.tokenUri),collection:text(raw.contract.name),quantity:/^\d+$/.test(String(raw.balance))?String(raw.balance):'1',transferable:standard!=='UNKNOWN',...(standard==='UNKNOWN'?{warning:'Ten standard NFT nie jest obsługiwany przy wysyłaniu.'}:{})};
}
export function heliusNft(raw:any,network:NftQuery['network']):Nft|null{
 if(raw?.burnt||raw?.interface==='FungibleToken'||raw?.interface==='FungibleAsset')return null;
 const address=new PublicKey(raw.id).toBase58(),standard:NftStandard=raw.compression?.compressed?'COMPRESSED':raw.interface==='MplCoreAsset'?'CORE':raw.interface==='ProgrammableNFT'?'PNFT':raw.interface==='V1_NFT'?'METAPLEX':'UNKNOWN';
 return {id:`SOL:${network}:${address}`,chain:'SOL',network,address,standard,name:text(raw.content?.metadata?.name)||'NFT bez nazwy',description:text(raw.content?.metadata?.description,1000),image:uri(raw.content?.links?.image||raw.content?.files?.find((f:any)=>String(f.mime).startsWith('image/'))?.uri),uri:uri(raw.content?.json_uri),collection:text(raw.grouping?.find((g:any)=>g.group_key==='collection')?.group_value,128),quantity:'1',transferable:['CORE','METAPLEX','PNFT'].includes(standard),...(['COMPRESSED','UNKNOWN'].includes(standard)?{warning:'Podgląd tego standardu jest dostępny; transfer wymaga zewnętrznego portfela.'}:{})};
}
async function fetchNftsRaw(query:NftQuery,owner:string,keys:IntegrationKeys):Promise<NftPage>{
 if(query.chain==='ETH'){
  if(query.mode==='explore'&&(!query.query||!isAddress(query.query)))throw new Error('Wpisz adres kontraktu kolekcji Ethereum.');
  if(query.mode==='explore'&&query.tokenId&&!keys.alchemy){
   const provider=ethereum(query.network);try{await checkEthereum(provider,query.network);const contract=new Contract(query.query!,[...ERC721,...ERC1155],provider);let standard:NftStandard='ERC721',tokenUri:string;try{tokenUri=await contract.tokenURI(query.tokenId);}catch{standard='ERC1155';tokenUri=await contract.uri(query.tokenId);tokenUri=tokenUri.replace(/\{id\}/g,BigInt(query.tokenId).toString(16).padStart(64,'0'));}let metadata:any={};try{metadata=await remoteMetadata(tokenUri);}catch{}return {items:[alchemyNft({contract:{address:query.query},tokenId:query.tokenId,tokenType:standard,name:metadata.name,description:metadata.description,image:{originalUrl:metadata.image||metadata.image_url},tokenUri},query.network)]};}finally{provider.destroy();}
  }
  if(!keys.alchemy)throw new Error('Dodaj klucz Alchemy w Ustawieniach → Integracje, aby pobrać listę NFT Ethereum.');
  const root=`https://${query.network==='mainnet'?'eth-mainnet':'eth-sepolia'}.g.alchemy.com/nft/v3/${encodeURIComponent(keys.alchemy)}/`;
  const endpoint=query.mode==='owned'?'getNFTsForOwner':query.tokenId?'getNFTMetadata':'getNFTsForContract';const url=new URL(endpoint,root);
  if(query.mode==='owned'){url.searchParams.set('owner',owner);url.searchParams.set('pageSize','12');url.searchParams.set('withMetadata','true');}
  else{url.searchParams.set('contractAddress',query.query!);if(query.tokenId)url.searchParams.set('tokenId',query.tokenId);else{url.searchParams.set('limit','12');url.searchParams.set('withMetadata','true');}}
  if(query.cursor)url.searchParams.set(query.mode==='owned'?'pageKey':'startToken',query.cursor);
  const data=await apiJson(url.href);const rows=endpoint==='getNFTMetadata'?[data]:query.mode==='owned'?data.ownedNfts:data.nfts;if(!Array.isArray(rows)||rows.length>100)throw new Error('Nieprawidłowa odpowiedź indeksu NFT.');
  const cursor=query.mode==='owned'?data.pageKey:data.nextToken;return {items:rows.map((row:any)=>alchemyNft(row,query.network)),...(typeof cursor==='string'&&cursor?{cursor:cursor.slice(0,2048)}:{})};
 }
 if(!keys.helius){
  if(query.mode==='owned')throw new Error('Dodaj klucz Helius w Ustawieniach → Integracje, aby pobrać listę NFT Solana.');
  if(query.scope==='collection')throw new Error('Dodaj klucz Helius w Ustawieniach → Integracje, aby przeglądać kolekcje Solana.');if(!query.query)throw new Error('Wpisz adres NFT Solana.');const address=new PublicKey(query.query).toBase58(),umi=createUmi(solRpc(query.network)).use(mplCore()).use(mplTokenMetadata());
  let name:string,tokenUri:string,standard:NftStandard;
  try{const asset=await fetchAsset(umi,publicKey(address));name=asset.name;tokenUri=asset.uri;standard='CORE';}catch{const asset=await fetchDigitalAsset(umi,publicKey(address));name=asset.metadata.name;tokenUri=asset.metadata.uri;standard='METAPLEX';}
  let metadata:any={};try{metadata=await remoteMetadata(tokenUri);}catch{}return {items:[{id:`SOL:${query.network}:${address}`,chain:'SOL',network:query.network,address,name,uri:uri(tokenUri),image:uri(metadata.image||metadata.image_url),description:text(metadata.description,1000),standard,quantity:'1',transferable:true}]};
 }
 let method='getAssetsByOwner',params:any={ownerAddress:owner,page:query.cursor?Number(query.cursor):1,limit:12};
 if(query.cursor&&!/^[1-9]\d{0,5}$/.test(query.cursor))throw new Error('Nieprawidłowa strona historii NFT.');
 if(query.mode==='explore'){
  if(!query.query)throw new Error('Wpisz adres NFT lub kolekcji Solana.');const address=new PublicKey(query.query).toBase58();
  const single=query.scope==='collection'?{result:null}:await apiJson(solRpc(query.network,keys),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getAsset',params:{id:address}})});
  if(single.result&&single.result.interface!=='MplCoreCollection'){const nft=heliusNft(single.result,query.network);return {items:nft?[nft]:[]};}
  method='searchAssets';params={grouping:['collection',address],page:params.page,limit:12};
 }
 const data=await apiJson(solRpc(query.network,keys),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 if(data.error||!Array.isArray(data.result?.items)||data.result.items.length>1000)throw new Error('Indeks NFT Solana nie udostępnił danych. Sprawdź klucz Helius i sieć.');
 return {items:data.result.items.map((row:any)=>heliusNft(row,query.network)).filter(Boolean),...(data.result.items.length===12?{cursor:String(params.page+1)}:{})};
}

export async function fetchNfts(query:NftQuery,owner:string,keys:IntegrationKeys):Promise<NftPage>{
 const page=await fetchNftsRaw(query,owner,keys);
 await Promise.all(page.items.map(async nft=>{
   if(!nft.image&&nft.uri){try{const md=await remoteMetadata(nft.uri);const image=md.image||md.image_url;if(typeof image==='string')nft.image=resolveMediaUri(image,nft.uri);}catch{nft.warning=[nft.warning,'Metadane lub obraz NFT są niedostępne.'].filter(Boolean).join(' ');}}
   // Eksploracja jest podglądem. Wysyłka wymaga osobnego potwierdzenia własności.
   nft.owned=query.mode==='owned';if(nft.owned)nft.id=owner+':'+nft.id;nft.transferable=nft.transferable&&query.mode==='owned';
 }));return page;
}
export async function verifyNftOwnership(nft:Nft,owner:string,keys:IntegrationKeys){
 if(nft.chain==='ETH'){const p=ethereum(nft.network);try{await checkEthereum(p,nft.network);if(nft.standard==='ERC721'){if((await new Contract(nft.address,ERC721,p).ownerOf(nft.tokenId)).toLowerCase()!==owner.toLowerCase())throw Error('Brak własności NFT.');}else if(nft.standard==='ERC1155'){if(await new Contract(nft.address,ERC1155,p).balanceOf(owner,nft.tokenId)<=0n)throw Error('Brak salda NFT.');}else throw Error('Nieobsługiwany standard awatara NFT.');}finally{p.destroy();}}
 else{const umi=createUmi(solRpc(nft.network,keys)).use(mplCore()).use(mplTokenMetadata());if(nft.standard==='CORE'){if((await fetchAsset(umi,publicKey(nft.address))).owner!==owner)throw Error('Brak własności NFT.');}else{const {Connection}=await import('@solana/web3.js');const c=new Connection(solRpc(nft.network,keys));const rows=await c.getParsedTokenAccountsByOwner(new PublicKey(owner),{mint:new PublicKey(nft.address)});if(!rows.value.some(r=>{const t=r.account.data.parsed.info;return t.owner===owner&&t.tokenAmount.decimals===0&&BigInt(t.tokenAmount.amount)>0n;}))throw Error('Brak własności NFT.');}}
 return true;
}
