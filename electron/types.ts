export type Chain = 'SOL' | 'ETH' | 'BTC';
export type Network = 'mainnet' | 'testnet';
export type Account = { chain: Chain; address: string; path: string; networkLabel: string };
export type Balance = Account & { balance: string | null; error?: string };
export type Quote = { id: string; walletId: string; chain: Chain; network: Network; networkLabel: string; from: string; to: string; amount: string; fee: string; feeLabel: string; expires: number };
export type Transfer = { hash: string; chain: Chain; network: Network; to: string; amount: string; at: number; explorer: string; status: 'broadcast' | 'unknown' };
export type Status = { exists: boolean; needsMigration: boolean; unlocked: boolean; accounts: Account[]; wallets: {id:string;name:string}[]; activeWalletId:string|null };
export interface WalletAPI {
 status(network: Network): Promise<Status>;
 generate(): Promise<string>;
 initialize(pin:string): Promise<Status>;
 migrate(input:{password:string;pin:string}):Promise<Status>;
 switchWallet(id:string,network:Network):Promise<Status>;
 renameWallet(id:string,name:string,network:Network):Promise<Status>;
 changePin(oldPin:string,newPin:string):Promise<void>;
 create(input: { name: string; passphrase: string; word3: string; word8: string }): Promise<Status>;
 import(input: { mnemonic: string; name: string; passphrase: string }): Promise<Status>;
 unlock(password: string, network: Network): Promise<Status>;
 lock(): Promise<void>;
 balances(network: Network): Promise<Balance[]>;
 quote(input: { chain: Chain; network: Network; to: string; amount: string }): Promise<Quote>;
 send(id: string): Promise<Transfer>;
 history(): Promise<Transfer[]>;
 reveal(password: string): Promise<{ mnemonic: string; passphrase: string }>;
 openExplorer(transfer: Transfer): Promise<void>;
 onLock(callback: () => void): () => void;
}
