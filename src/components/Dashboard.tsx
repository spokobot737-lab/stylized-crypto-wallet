import { tr } from '../lib/i18n';
import UsdcPanel from './UsdcPanel';
import type { WalletAPI } from '../../electron/types';
import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Activity, GripVertical, ArrowLeft, ArrowRight, Minus, Plus, SlidersHorizontal } from 'lucide-react';
import type { Account, Balance, Chain, Network, ActivityPage, ActivityItem } from '../../electron/types';
import { CryptoIcon } from './CryptoIcon';
import { ActivityPanel } from './ActivityPanel';
import { Button, CopyButton, Tag } from './ui';
import { numberText, shorten, moveAsset, type Preferences, type CardSize } from '../lib/preferences';
const metadata = { SOL: { name: 'Solana', className: 'sol' }, ETH: { name: 'Ethereum', className: 'eth' }, BTC: { name: 'Bitcoin', className: 'btc' } };
const sizes: CardSize[] = ['small', 'medium', 'large'];
export default function Dashboard({ api, walletId, accounts, balances, network, name, activity, activityLoading, onActivityRefresh, onActivityMore, loading, hidden, prefs, onPreferences, onRefresh, onReceive, onSend, onExplorer }: {
    api?: WalletAPI;
    walletId?: string;
    accounts: Account[];
    balances: Balance[];
    network: Network;
    name: string;
    activity: ActivityPage | null;
    activityLoading: boolean;
    onActivityRefresh: () => void;
    onActivityMore: (chain: Chain, cursor: string) => void;
    loading: boolean;
    hidden: boolean;
    prefs: Preferences;
    onPreferences: (p: Preferences) => void;
    onRefresh: () => void;
    onReceive: (c: Chain) => void;
    onSend: (c: Chain) => void;
    onExplorer: (t: ActivityItem) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [dragging, setDragging] = useState<Chain>();
    const ordered = prefs.assetOrder.flatMap(c => accounts.filter(a => a.chain === c));
    function move(chain: Chain, target: Chain) { onPreferences({ ...prefs, assetOrder: moveAsset(prefs.assetOrder, chain, target) }); }
    function resize(chain: Chain, direction: number) { const current = prefs.cardSizes[chain] || prefs.cardSize; const next = sizes[Math.max(0, Math.min(2, sizes.indexOf(current) + direction))]; onPreferences({ ...prefs, cardSizes: { ...prefs.cardSizes, [chain]: next } }); }
    return <div className="dashboard"><div className="wallet-heading"><div><div className="eyebrow">{network === 'mainnet' ? 'MAINNET' : tr("SIECI TESTOWE")}</div><h1>{name}</h1></div><div className="wallet-heading-actions"><Button className="primary" onClick={() => onReceive(ordered[0]?.chain || 'SOL')}><ArrowDownLeft size={17}/>{tr(" Odbierz")}</Button><Button onClick={() => onSend(ordered[0]?.chain || 'SOL')}><ArrowUpRight size={17}/>{tr(" Wy\u015Blij")}</Button></div></div>
 <div className="asset-toolbar"><h2>{tr("Aktywa")}</h2><div><button className={`text-button ${editing ? 'selected' : ''}`} aria-pressed={editing} onClick={() => setEditing(!editing)}><SlidersHorizontal size={16}/>{editing ? tr("Zako\u0144cz edycj\u0119") : tr("Zmie\u0144 uk\u0142ad")}</button><button className={`text-button refresh ${loading ? 'spinning' : ''}`} onClick={onRefresh} disabled={loading}><RefreshCw size={15}/>{loading ? tr("Pobieranie\u2026") : tr("Od\u015Bwie\u017C")}</button></div></div>
 {editing && <p className="layout-hint">{tr("Przeci\u0105gnij kafelki lub u\u017Cyj strza\u0142ek. Przyciski \u2212 / + zmieniaj\u0105 rozmiar wybranego kafelka.")}</p>}
 {prefs.widgets.assets&&<div className={`assets-grid resizable-assets ${editing ? 'is-editing' : ''}`}>{ordered.map((account, i) => {
            const meta = metadata[account.chain];
            const balance = balances.find(b => b.chain === account.chain);
            const size = prefs.cardSizes[account.chain] || prefs.cardSize;
            return <article style={{ viewTransitionName: `asset-${account.chain}` }} data-testid={`asset-${account.chain}`} data-size={size} className={`asset-card ${meta.className} size-${size} ${dragging === account.chain ? 'dragging' : ''}`} key={account.chain} draggable={editing} onDragStart={e => { setDragging(account.chain); e.dataTransfer.setData('text/plain', account.chain); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragging(undefined)} onDragOver={e => { if (editing)
                e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (dragging && dragging !== account.chain)
                move(dragging, account.chain); setDragging(undefined); }}>
 {editing && <div className="card-edit-controls"><GripVertical size={15}/><button aria-label={tr("Przesu\u0144 {0} w lewo", account.chain)} disabled={i === 0} onClick={() => move(account.chain, ordered[i - 1].chain)}><ArrowLeft size={14}/></button><button aria-label={tr("Przesu\u0144 {0} w prawo", account.chain)} disabled={i === ordered.length - 1} onClick={() => move(account.chain, ordered[i + 1].chain)}><ArrowRight size={14}/></button><span /><button aria-label={`Zmniejsz kafelek ${account.chain}`} disabled={size === 'small'} onClick={() => resize(account.chain, -1)}><Minus size={14}/></button><button aria-label={tr("Powi\u0119ksz kafelek {0}", account.chain)} disabled={size === 'large'} onClick={() => resize(account.chain, 1)}><Plus size={14}/></button></div>}
 <div className="asset-top"><CryptoIcon chain={account.chain} size={34}/><h3>{meta.name}</h3><Tag>{account.chain}</Tag></div><div className="asset-balance mono" data-testid={`balance-${account.chain}`}>{hidden ? '••••••' : loading && !balance ? '…' : balance?.balance === null ? tr("Brak danych") : balance ? numberText(balance.balance) : '…'}<span>{account.chain}</span></div><div className="asset-address mono"><span>{shorten(account.address)}</span><CopyButton value={account.address}/></div>{balance?.error && <p className="asset-error" title={balance.error}>{tr("RPC niedost\u0119pne. Spr\u00F3buj od\u015Bwie\u017Cy\u0107.")}</p>}<div className="asset-footer"><button aria-label={tr("Odbierz {0}", account.chain)} onClick={() => onReceive(account.chain)}><ArrowDownLeft size={16}/><span>{tr("Odbierz")}</span></button><button aria-label={tr("Wy\u015Blij {0}", account.chain)} onClick={() => onSend(account.chain)}><ArrowUpRight size={16}/><span>{tr("Wy\u015Blij")}</span></button></div></article>;
        })}</div>}
 {prefs.widgets.stablecoins&&api && walletId && <UsdcPanel key={`${walletId}:${network}`} api={api} network={network} walletId={walletId} hidden={hidden} size={prefs.widgetSizes.stablecoins} onReceive={onReceive}/>}
 <div className={`widget-size-${prefs.widgetSizes.activity}`}><ActivityPanel data={activity} loading={activityLoading} prefs={prefs} onPreferences={onPreferences} onRefresh={onActivityRefresh} onMore={onActivityMore} onExplorer={onExplorer} accounts={accounts} network={network} hidden={hidden}/></div></div>;
}
