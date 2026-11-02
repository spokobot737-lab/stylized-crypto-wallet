import FrameRun from './components/FrameRun';
import Chat from './components/Chat';
import { tr } from './lib/i18n';
import { flushSync } from 'react-dom';
import { Brand } from './components/Brand';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Image as ImageIcon, ArrowUpRight, LayoutDashboard, Settings2, LockKeyhole, Eye, EyeOff, ArrowLeftRight, Hexagon, Plus, WalletCards } from 'lucide-react';
import type { Account, Balance, Chain, Network, Status, ActivityPage } from '../electron/types';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import NftDashboard from './components/NftDashboard';
import { setLanguage } from './lib/i18n';
import Onboarding, { AppGate } from './components/Onboarding';
import ProfileMenu from './components/ProfileMenu';
import { WalletManager, PinSettings } from './components/WalletSettings';
import { BackupModal, ReceiveModal, SendModal } from './components/TransferModal';
import { loadPreferences, type Preferences } from './lib/preferences';
import { Button, ErrorMessage, Modal, Tag } from './components/ui';
const previewAccounts: Account[] = [{ chain: 'SOL', address: 'So11111111111111111111111111111111111111112', path: "m/44'/501'/0'/0'", networkLabel: 'Solana Mainnet' }, { chain: 'ETH', address: '0x0000000000000000000000000000000000000000', path: "m/44'/60'/0'/0/0", networkLabel: 'Ethereum Mainnet' }, { chain: 'BTC', address: 'bc1qpreviewaddress', path: "m/84'/1'/0'/0/0", networkLabel: 'Bitcoin Mainnet' }];
type Popup = {
    kind: 'send' | 'receive' | 'backup' | 'add' | 'wallets' | 'pin' | 'about';
    chain: Chain;
};
export default function App() {
    const api = window.wallet;
    const [prefs, setPrefs] = useState<Preferences>(loadPreferences), [status, setStatus] = useState<Status>(), [network, setNetwork] = useState<Network>('mainnet'), [page, setPage] = useState<'wallet' | 'appearance' | 'nft' | 'chat' | 'game'>('wallet'), [balanceList, setBalanceList] = useState<Balance[]>([]), [activity, setActivity] = useState<ActivityPage | null>(null), [activityLoading, setActivityLoading] = useState(false), [hidden, setHidden] = useState(false), [loading, setLoading] = useState(false), [switching, setSwitching] = useState(false), [error, setError] = useState(''), [modal, setModal] = useState<Popup>(), [mainnetPrompt, setMainnetPrompt] = useState(false), [skipMainnetPrompt, setSkipMainnetPrompt] = useState(false), [toast, setToast] = useState('');
    const [settingsTab,setSettingsTab]=useState<'general'|'integrations'>('general');
    const requestVersion = useRef(0), activityVersion = useRef(0);
    const preview = !api, unlocked = preview || !!status?.unlocked;
    const accountList = preview ? previewAccounts : status?.accounts || [];
    const activeId = status?.activeWalletId;
    const walletName = status?.wallets.find(w => w.id === activeId)?.name || 'FRAME';
    const live = useRef({ unlocked, network, activeId });
    live.current = { unlocked, network, activeId };
    const closeModal = useCallback(() => setModal(undefined), []);
    const invalidate = useCallback(() => { requestVersion.current++; setBalanceList([]); activityVersion.current++; setActivity(null); setActivityLoading(false); setLoading(false); setError(''); }, []);
    const locked = useCallback(() => { invalidate(); setStatus(s => s ? { ...s, unlocked: false, accounts: [], wallets: [], activeWalletId: null } : s); setModal(undefined); setMainnetPrompt(false); }, [invalidate]);
    useEffect(() => { document.documentElement.dataset.theme = prefs.theme; document.documentElement.dataset.accent = prefs.accent; document.documentElement.dataset.density = prefs.density; document.documentElement.dataset.texture = String(prefs.texture); document.documentElement.dataset.motion = String(prefs.motion&&prefs.motionStyle!=='off'&&unlocked&&document.visibilityState!=='hidden'); document.documentElement.dataset.motionStyle=prefs.motionStyle; document.documentElement.dataset.motionSpeed = prefs.motionSpeed; document.documentElement.dataset.motionIntensity = prefs.motionIntensity; localStorage.setItem('frame:preferences', JSON.stringify(prefs)); document.documentElement.lang = prefs.language; void api?.configure({ language: prefs.language }).catch(() => { }); }, [prefs,unlocked]);
    useEffect(()=>{const sync=()=>{document.documentElement.dataset.motion=String(prefs.motion&&prefs.motionStyle!=='off'&&unlocked&&!document.hidden);};document.addEventListener('visibilitychange',sync);return()=>document.removeEventListener('visibilitychange',sync);},[prefs.motion,unlocked]);
    useEffect(() => { if (!api)
        return; api.status('mainnet').then(setStatus).catch(e => setError(e.message)); return api.onLock(locked); }, [api, locked]);
    const refresh = useCallback(async () => { if (!api || !live.current.unlocked || !activeId)
        return; const version = ++requestVersion.current, net = network, walletId = activeId; setLoading(true); try {
        const b = await api.balances(net);
        if (version === requestVersion.current && live.current.unlocked && live.current.network === net && live.current.activeId === walletId) {
            setBalanceList(b);
            setError('');
        }
    }
    catch (e) {
        if (version === requestVersion.current)
            setError((e as Error).message);
    }
    finally {
        if (version === requestVersion.current)
            setLoading(false);
    } }, [api, network, activeId]);
    const refreshActivity = useCallback(async (chain?: Chain, cursor?: string) => {
        if (!api || !live.current.unlocked || !activeId || !prefs.activity.visible)
            return;
        const version = ++activityVersion.current, net = network, walletId = activeId;
        setActivityLoading(true);
        try {
            const page = await api.activity({ network: net, ...(chain ? { chain, cursor } : {}) });
            if (version === activityVersion.current && live.current.unlocked && live.current.network === net && live.current.activeId === walletId)
                setActivity(old => {
                    if(!old)return page;
                    const items = new Map(old.items.map(t => [t.id, t]));
                    for (const t of page.items)
                        items.set(t.id, t);
                    return { ...page, items: [...items.values()].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || (b.at || 0) - (a.at || 0)), next: {...old.next,...page.next}, warnings: page.warnings };
                });
        }
        catch (e) {
            if (version === activityVersion.current)
                setActivity(old => ({ ...old, items: old?.items || [], next: old?.next || {}, fetchedAt: Date.now(), warnings: [{ chain: chain || 'SOL', message: (e as Error).message }] }));
        }
        finally {
            if (version === activityVersion.current)
                setActivityLoading(false);
        }
    }, [api, network, activeId, prefs.activity.visible]);
    useEffect(() => { if (!unlocked || !activeId || !prefs.activity.visible)
        return; void refreshActivity(); const timer = setInterval(() => void refreshActivity(), 60000); return () => { activityVersion.current++; clearInterval(timer); }; }, [unlocked, activeId, refreshActivity, prefs.activity.visible]);
    function updatePreferences(next: Preferences) { setLanguage(next.language); const layout = JSON.stringify([prefs.assetOrder, prefs.cardSize, prefs.cardSizes]) !== JSON.stringify([next.assetOrder, next.cardSize, next.cardSizes]); if (layout && next.motion && !matchMedia('(prefers-reduced-motion: reduce)').matches && typeof document.startViewTransition === 'function') {
        document.startViewTransition(() => flushSync(() => setPrefs(next))).finished.catch(() => { });
    }
    else
        setPrefs(next); }
    useEffect(() => { if (!unlocked || !activeId)
        return; void refresh(); const timer = setInterval(() => void refresh(), 45000); return () => clearInterval(timer); }, [unlocked, activeId, refresh]);
    useEffect(() => { if (!toast)
        return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);
    async function changeNetwork(next: Network) { if (switching)
        return; if (!api) {
        setToast(tr("Sieci s\u0105 dost\u0119pne w aplikacji desktopowej."));
        setMainnetPrompt(false);
        return;
    } invalidate(); setSwitching(true); setModal(undefined); setMainnetPrompt(false); try {
        await api.configure({ network: next });
        const s = await api.status(next);
        setNetwork(next);
        setStatus(s);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setSwitching(false);
    } }
    async function switchWallet(id: string) { if (!api || !live.current.unlocked || switching)
        return; invalidate(); setModal(undefined); setSwitching(true); try {
        const s = await api.switchWallet(id, network);
        if (live.current.unlocked)
            setStatus(s);
        setModal(undefined);
    }
    catch (e) {
        setError((e as Error).message);
        throw e;
    }
    finally {
        setSwitching(false);
    } }
    function open(kind: Popup['kind'], chain: Chain = 'SOL') { if (switching)
        return; if (preview && kind !== 'about') {
        setToast(tr("Operacje portfela s\u0105 dost\u0119pne w wersji desktopowej."));
        return;
    } setModal({ kind, chain }); }
    function ready(s: Status) { invalidate(); setStatus(s); setPage('wallet'); }
    async function added() { if (!api)
        return; invalidate(); setStatus(await api.status(network)); closeModal(); }
    async function lockApp() { try {
        await api?.lock();
        locked();
    }
    catch (e) {
        setError((e as Error).message);
    } }
    if (api && !status)
        return <div className="app-gate"><Brand />{error ? <ErrorMessage error={error}/> : <p>{tr("Otwieranie aplikacji\u2026")}</p>}</div>;
    if (api && status && !status.unlocked)
        return <AppGate api={api} status={status} network={network} onReady={ready}/>;
    return <div className="app-shell"><aside className="sidebar"><Brand /><div className="wallet-selector"><label htmlFor="active-wallet">{tr("Aktywny portfel")}</label><select title={walletName} id="active-wallet" aria-label={tr("Aktywny portfel")} value={activeId || ''} disabled={switching || preview || !status?.wallets.length} onChange={e => void switchWallet(e.target.value).catch(() => { })}>{preview ? <option>{tr("Podgl\u0105d")}</option> : status?.wallets.length ? status.wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>) : <option value="">{tr("Brak portfeli")}</option>}</select><button onClick={() => open('add')} disabled={switching} title={tr("Dodaj portfel")}><Plus size={16}/><span>{tr("Dodaj portfel")}</span></button></div>
 <nav aria-label="Usługi"><button className={page==='wallet'?'active':''} onClick={()=>setPage('wallet')}><LayoutDashboard size={20}/><span>{tr('Twój portfel')}</span></button><button className={page==='nft'?'active':''} onClick={()=>setPage('nft')}><ImageIcon size={20}/><span>NFT</span></button><button className={page==='chat'?'active':''} onClick={()=>setPage('chat')}><MessageCircle size={20}/><span>Chat</span></button><button aria-label="FRAME Run" className={page==='game'?'active':''} onClick={()=>setPage('game')}><Hexagon size={20}/><span>FRAME Run</span></button></nav><div className="sidebar-bottom"><div className="sidebar-network"><small>{tr('SIEĆ')}</small><span className={`network-label ${network}`}>{network.toUpperCase()}</span></div><button className={`sidebar-settings ${page==='appearance'?'active':''}`} onClick={()=>{setSettingsTab('general');setPage('appearance');}}><Settings2 size={20}/><span>{tr('Ustawienia')}</span></button><div className="sidebar-version mono">FRAME V.0.7.0</div></div></aside>
 <main className="main-content"><header className="topbar"><div className="breadcrumb"><b>{page === 'wallet' ? tr("PORTFEL") : page==='game'?'FRAME RUN':page==='chat'?'CHAT': page === 'nft' ? 'NFT' : tr("USTAWIENIA")}</b></div><div className="topbar-actions"><Tag>{preview ? tr("PODGL\u0104D UI") : tr("APLIKACJA ODBLOKOWANA")}</Tag><button className="icon-button" aria-label={hidden ? tr("Poka\u017C salda") : tr("Ukryj salda")} onClick={() => setHidden(!hidden)}>{hidden ? <EyeOff size={18}/> : <Eye size={18}/>}</button>{!preview && <button className="lock-button" onClick={() => void lockApp()}><LockKeyhole size={16}/>{tr(" Zablokuj")}</button>}<ProfileMenu name={walletName} onWallets={() => open('wallets')} onSettings={() => {setSettingsTab('general');setPage('appearance');}} onBackup={() => open('backup')} onPin={() => open('pin')} onAbout={() => open('about')} onLock={() => void lockApp()}/></div></header>
 <div className="content-body page-enter" key={`${page}:${activeId || 'preview'}`}>{preview && <div className="preview-banner">{tr("Podgl\u0105d interfejsu. Operacje portfela s\u0105 dost\u0119pne w wersji desktopowej.")}</div>}<ErrorMessage error={error}/>{page === 'appearance' ? <Settings key={settingsTab} initialTab={settingsTab} prefs={prefs} api={api} network={network} switching={switching} onNetwork={next => { if (next === network || switching)
        return; if (next === 'mainnet' && prefs.confirmMainnet) {
        setSkipMainnetPrompt(false);
        setMainnetPrompt(true);
    }
    else
        void changeNetwork(next); }} onChange={updatePreferences}/> : api && !status?.wallets.length ? <section className="panel first-wallet"><Onboarding api={api} initialName="Portfel 1" onReady={() => void added()}/></section> : page==='game'?<FrameRun key={`${activeId}:${network}`} api={api} context={`${activeId}:${network}`}/>: page==='chat'?(api&&activeId?<Chat key={activeId} api={api} walletId={activeId} name={walletName} network={network}/>:<p>{tr('Czat jest dostępny po odblokowaniu aplikacji desktopowej.')}</p>): page === 'nft' ? (api && activeId ? <NftDashboard key={`${activeId}:${network}`} api={api} network={network} accounts={accountList} walletId={activeId} onSettings={() => {setSettingsTab('integrations');setPage('appearance');}}/> : <p>{tr("Modu\u0142 NFT jest dost\u0119pny w aplikacji desktopowej.")}</p>) : <Dashboard api={api} walletId={activeId || undefined} accounts={accountList} balances={preview ? previewAccounts.map(a => ({ ...a, balance: '0' })) : balanceList} network={network} name={preview ? tr("Podgl\u0105d portfela") : walletName} activity={activity} activityLoading={activityLoading} onActivityRefresh={() => void refreshActivity()} onActivityMore={(chain, cursor) => void refreshActivity(chain, cursor)} loading={loading || switching} hidden={hidden} prefs={prefs} onPreferences={updatePreferences} onRefresh={() => void refresh()} onReceive={c => open('receive', c)} onSend={c => open('send', c)} onExplorer={t => void api?.openExplorer(t).catch(e => setError(e.message))}/>}</div></main>
 {toast && <div className="toast" role="status">{toast}</div>}{modal?.kind === 'receive' && accountList.length > 0 && <ReceiveModal accounts={accountList} chain={modal.chain} onClose={closeModal}/>} {modal?.kind === 'send' && api && accountList.length > 0 && <SendModal api={api} network={network} chain={modal.chain} accounts={accountList} onClose={closeModal} onSent={() => { void refresh(); void refreshActivity(); }}/>}{modal?.kind === 'backup' && api && activeId && <BackupModal api={api} onClose={closeModal}/>}{modal?.kind === 'add' && api && <Modal title={tr("Nowy portfel")} eyebrow={tr("PORTFELE")} onClose={closeModal}><Onboarding api={api} initialName={tr("Portfel {0}", (status?.wallets.length || 0) + 1)} onReady={() => void added()} onCancel={closeModal}/></Modal>}{modal?.kind === 'wallets' && api && status && <WalletManager api={api} status={status} network={network} onClose={closeModal} onStatus={s => { invalidate(); setStatus(s); void refresh(); void refreshActivity(); }} onAdd={() => open('add')} onSwitch={switchWallet}/>} {modal?.kind === 'pin' && api && <PinSettings api={api} onClose={closeModal}/>}
 {modal?.kind === 'about' && <Modal title={tr("O FRAME Wallet")} eyebrow={tr("WERSJA 0.7.0")} onClose={closeModal}><p>{tr("Twoje klucze s\u0105 przechowywane w lokalnym, szyfrowanym sejfie. Jeden PIN odblokowuje wszystkie portfele.")}</p><div className="note">{tr("PIN jest powi\u0105zany z systemowym magazynem kluczy. Do odzyskania \u015Brodk\u00F3w na innym urz\u0105dzeniu potrzebujesz fraz seed i odpowiednich passphrase BIP39.")}</div><p className="muted small">{tr("SOL, ETH, BTC, USDC oraz NFT Ethereum i Solana. Domy\u015Blnie Mainnet. Sieci testowe s\u0105 dost\u0119pne w Ustawieniach \u2192 Og\u00F3lne. Wersja eksperymentalna, bez niezale\u017Cnego audytu bezpiecze\u0144stwa.")}</p><Button className="full" onClick={closeModal}>{tr("Zamknij informacje")}</Button></Modal>}{mainnetPrompt && <Modal title={tr("Przej\u015B\u0107 na Mainnet?")} eyebrow={tr("SIE\u0106")} onClose={() => setMainnetPrompt(false)}><p>{tr("Na Mainnet u\u017Cywasz prawdziwych SOL, ETH i BTC. Adres BTC zmieni si\u0119 na g\u0142\u00F3wny. Przelewy s\u0105 nieodwracalne.")}</p><label className="check-row mainnet-remember"><input type="checkbox" checked={skipMainnetPrompt} onChange={e => setSkipMainnetPrompt(e.target.checked)}/><span>{tr("Nie pokazuj ponownie")}</span></label><p className="muted small">{tr("To potwierdzenie mo\u017Cesz przywr\u00F3ci\u0107 w Ustawieniach \u2192 Og\u00F3lne.")}</p><Button className="primary full" onClick={() => { if (skipMainnetPrompt)
        updatePreferences({ ...prefs, confirmMainnet: false }); void changeNetwork('mainnet'); }}>{tr("W\u0142\u0105cz Mainnet ")}<ArrowUpRight size={18}/></Button></Modal>}</div>;
}
