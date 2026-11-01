import { tr } from '../lib/i18n';
import { useState } from 'react';
import { Settings2, Palette, Globe2, KeyRound, Languages } from 'lucide-react';
import type { Preferences } from '../lib/preferences';
import type { Network, WalletAPI } from '../../electron/types';
import { Field, SectionHead } from './ui';
import Appearance from './Appearance';
import IntegrationsSettings from './IntegrationsSettings';
export default function Settings({ prefs, onChange, api, network, switching, onNetwork,initialTab='general' }: {
    initialTab?:'general'|'integrations';
    prefs: Preferences;
    onChange: (p: Preferences) => void;
    api?: WalletAPI;
    network: Network;
    switching: boolean;
    onNetwork: (next: Network) => void;
}) {
    const [tab, setTab] = useState<'general' | 'appearance' | 'integrations'>(initialTab);
    return <div className="settings-page"><div className="settings-tabs" aria-label={tr("Sekcje ustawie\u0144")}>{([['general', tr("Og\u00F3lne"), Settings2], ['appearance', tr("Wygl\u0105d"), Palette], ['integrations', tr("Integracje"), KeyRound]] as const).map(([value, label, Icon]) => <button key={value} className={tab === value ? 'active' : ''} aria-pressed={tab === value} onClick={() => setTab(value)}><Icon size={17}/>{label}</button>)}</div>{tab === 'appearance' ? <Appearance prefs={prefs} onChange={onChange}/> : tab === 'integrations' ? <IntegrationsSettings api={api}/> : <div className="general-settings page-enter"><SectionHead eyebrow={tr("USTAWIENIA")} title={tr("Og\u00F3lne")} action={<Settings2 />}/><div className="settings-grid"><section className="panel settings-panel network-settings"><h3><Globe2 size={19}/>{tr("Sieci")}</h3><div className="setting-copy"><strong>{tr("\u015Arodowisko aplikacji")}</strong><p className="muted small">{tr("Zmiana dotyczy wszystkich portfeli, NFT i USDC. Przy uruchomieniu aplikacja wybiera Mainnet.")}</p></div><div className="network-setting-switch" role="group" aria-label={tr("\u015Arodowisko sieciowe")}><button disabled={switching} aria-pressed={network === 'mainnet'} onClick={() => onNetwork('mainnet')}>Mainnet</button><button disabled={switching} aria-pressed={network === 'testnet'} onClick={() => onNetwork('testnet')}>Testnet</button></div><p className="muted small">{tr("Testnet oznacza Ethereum Sepolia, Solana Devnet i Bitcoin Testnet3. Adres BTC zmienia si\u0119 wraz z sieci\u0105.")}</p><label className="toggle-row"><span>{tr("Potwierdzaj przej\u015Bcie na Mainnet")}</span><input type="checkbox" checked={prefs.confirmMainnet} onChange={e => onChange({ ...prefs, confirmMainnet: e.target.checked })}/></label><p className="muted small">{tr("Po wy\u0142\u0105czeniu aplikacja zmienia sie\u0107 od razu. Potwierdzenie wysy\u0142ania i mintowania pozostaje wymagane.")}</p></section><section className="panel settings-panel"><h3><Languages size={19}/>{tr("J\u0119zyk")}</h3><Field label={tr("J\u0119zyk aplikacji")}><select aria-label={tr("J\u0119zyk aplikacji")} value={prefs.language} onChange={e => onChange({ ...prefs, language: e.target.value as Preferences['language'] })}><option value="pl">{tr("Polski (PL)")}</option><option value="en">{tr("Angielski (EN)")}</option></select></Field><p className="muted small">{tr("Polski jest j\u0119zykiem domy\u015Blnym. Zmiana dzia\u0142a od razu i zostaje zapami\u0119tana po restarcie.")}</p></section></div></div>}</div>;
}
