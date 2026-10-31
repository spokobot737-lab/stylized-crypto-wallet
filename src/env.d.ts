import type { WalletAPI } from '../electron/types';
declare global {interface Window {wallet?:WalletAPI;}}
