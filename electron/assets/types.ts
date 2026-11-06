import type { Network } from '../types';

export type AssetChain = 'ETH' | 'SOL' | 'RH';
export type Language = 'pl' | 'en';
export type NftStandard = 'ERC721' | 'ERC1155' | 'CORE' | 'METAPLEX' | 'PNFT' | 'COMPRESSED' | 'UNKNOWN';
export type Nft = {
 id:string; chain:AssetChain; network:Network; address:string; tokenId?:string;
 standard:NftStandard; name:string; description:string; image?:string; uri?:string;
 original?:{hash:string;size:number;mime:string;uri:string};owned?:boolean; collection?:string; quantity:string; transferable:boolean; warning?:string;
};
export type NftPage = {items:Nft[]; cursor?:string; warning?:string};
export type NftQuery = {chain:AssetChain; network:Network; mode:'owned'|'explore'; scope?:'asset'|'collection'; query?:string; tokenId?:string; cursor?:string};
export type UsdcBalance = {chain:AssetChain; network:Network; address:string; contract:string; balance:string|null; error?:string};
export type MintItem = {name:string; uri:string};
export type AssetIntent =
 | {kind:'usdc';chain:AssetChain;network:Network;to:string;amount:string}
 | {kind:'token';chain:'ETH'|'RH';network:Network;address:string;to:string;amount:string}
 | {kind:'nft';chain:AssetChain;network:Network;address:string;tokenId?:string;standard:NftStandard;to:string;amount:string}
 | {kind:'mint';creationId?:string;chain:AssetChain;network:Network;mode:'single'|'collection'|'batch';name:string;symbol:string;uri:string;collection?:string;items:MintItem[]};
export type AssetQuote = {id:string;walletId:string;chain:AssetChain;network:Network;from:string;to:string;title:string;details:string[];fee:string;feeLabel:string;transactions:number;expires:number;createdAddresses:string[]};
export type AssetOperation = {id:string;walletId:string;chain:AssetChain;network:Network;title:string;at:number;hashes:string[];createdAddresses:string[];state:'prepared'|'broadcast'|'partial'|'unknown';error?:string};
export type IntegrationKeys = {alchemy?:string;helius?:string;pinata?:string};
export type IntegrationStatus = {alchemy:boolean;helius:boolean;pinata:boolean};
export type MetadataUpload = {name:string;description:string;imageBase64:string;mime:'image/png'|'image/jpeg'|'image/webp'};
export interface AssetsAPI {
 creation(input:{action:string;[key:string]:unknown}):Promise<any>;
 integrations():Promise<IntegrationStatus>;
 saveIntegrations(input:Partial<Record<keyof IntegrationKeys,string|null>>):Promise<IntegrationStatus>;
 configure(input:{network?:Network;language?:Language}):Promise<void>;
 nfts(input:NftQuery):Promise<NftPage>;
 nftFileHash(input:{uri:string;hash:string}):Promise<{hash:string;matches:boolean;size:number}>;
 nftImage(uri:string,retry?:boolean):Promise<string>;
 uploadMetadata(input:MetadataUpload):Promise<{uri:string;image:string}>;
 usdc(network:Network):Promise<UsdcBalance[]>;
 assetQuote(input:AssetIntent):Promise<AssetQuote>;
 assetSend(id:string):Promise<AssetOperation>;
 assetOperations():Promise<AssetOperation[]>;
}
