import { tr } from '../lib/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import type { UsdcBalance, AssetChain } from '../../electron/assets/types';
import type { Network, WalletAPI } from '../../electron/types';
import { CryptoIcon } from './CryptoIcon';
import { Button, CopyButton, ErrorMessage, Tag } from './ui';
import { numberText, shorten } from '../lib/preferences';
import AssetTransfer from './AssetOperation';
export default function UsdcPanel({ api, network, walletId, hidden, size='medium', onReceive }: {
    api: WalletAPI;
    network: Network;
    walletId: string;
    hidden: boolean;
    size?:'small'|'medium'|'large';
    onReceive: (chain: AssetChain) => void;
}) {
    const [balances, setBalances] = useState<UsdcBalance[]>([]), [loading, setLoading] = useState(false), [send, setSend] = useState<AssetChain>(), [error,setError]=useState('');
    const request = useRef(0);
    const refresh = useCallback(async () => { const version = ++request.current; setLoading(true);setError(''); try {
        const rows = await api.usdc(network);
        if (version === request.current)
            setBalances(rows);
    }
    catch (e) {
        if (version === request.current){setBalances([]);setError((e as Error).message);}
    }
    finally {
        if (version === request.current)
            setLoading(false);
    } }, [api, network, walletId]);
    useEffect(() => { setBalances([]); setSend(undefined); void refresh(); const timer = setInterval(() => void refresh(), 60000); return () => { request.current++; clearInterval(timer); }; }, [refresh]);
    return <section className={`stablecoins-section widget-size-${size}`}><div className="asset-toolbar"><h2>{tr('Stablecoiny')}</h2><button className="text-button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15}/>{loading ? tr("Pobieranie\u2026") : tr("Odśwież stablecoiny")}</button></div><div className="usdc-grid">{(['ETH', 'SOL'] as const).map(chain => { const balance = balances.find(b => b.chain === chain); return <article className="panel usdc-card" key={chain} data-testid={`usdc-${chain}`}><div className="usdc-card-head"><img src="./coins/usdc.svg" alt="USDC" width="34" height="34"/><h3>USDC</h3><Tag><CryptoIcon chain={chain} size={16}/>{chain === 'ETH' ? 'Ethereum' : 'Solana'}</Tag></div><strong className="usdc-balance mono">{hidden ? '••••••' : balance?.balance === null ? tr("Brak danych") : balance ? numberText(balance.balance) : loading ? '…' : tr('Brak danych')}<small>USDC</small></strong>{balance && <div className="asset-address mono"><span>{shorten(balance.address)}</span><CopyButton value={balance.address}/></div>}{balance?.error && <p className="muted small">{tr(balance.error)}</p>}<div className="usdc-actions"><Button onClick={() => onReceive(chain)}><ArrowDownLeft size={16}/>{tr("Odbierz")}</Button><Button onClick={() => setSend(chain)}><ArrowUpRight size={16}/>{tr("Wy\u015Blij")}</Button></div></article>; })}</div><ErrorMessage error={error}/>{send && <AssetTransfer api={api} intent={{ kind: 'usdc', chain: send, network, to: '', amount: '' }} onClose={() => setSend(undefined)} onDone={() => void refresh()}/>}</section>;
}
