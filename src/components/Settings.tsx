import { useState } from 'react';
import { Settings2, Palette, Globe2 } from 'lucide-react';
import type { Preferences } from '../lib/preferences';
import { SectionHead } from './ui';
import Appearance from './Appearance';

export default function Settings({prefs,onChange}:{prefs:Preferences;onChange:(p:Preferences)=>void}){
 const [tab,setTab]=useState<'general'|'appearance'>('general');
 return <div className="settings-page"><div className="settings-tabs" aria-label="Sekcje ustawień"><button className={tab==='general'?'active':''} aria-pressed={tab==='general'} onClick={()=>setTab('general')}><Settings2 size={17}/>Ogólne</button><button className={tab==='appearance'?'active':''} aria-pressed={tab==='appearance'} onClick={()=>setTab('appearance')}><Palette size={17}/>Wygląd</button></div>{tab==='appearance'?<Appearance prefs={prefs} onChange={onChange}/>:<div className="general-settings page-enter"><SectionHead eyebrow="USTAWIENIA" title="Ogólne" action={<Settings2/>}/><section className="panel settings-panel network-settings"><h3><Globe2 size={19}/> Sieci</h3><div className="setting-copy"><strong>Domyślna sieć: Mainnet</strong><p className="muted small">Każde uruchomienie otwiera sieci główne Solana, Ethereum i Bitcoin. Sieci testowe włączysz przełącznikiem w panelu bocznym.</p></div><label className="toggle-row"><span>Potwierdzaj przejście na Mainnet</span><input type="checkbox" checked={prefs.confirmMainnet} onChange={e=>onChange({...prefs,confirmMainnet:e.target.checked})}/></label><p className="muted small">Dotyczy przełączania z Testnet na Mainnet. Po wyłączeniu aplikacja zmienia sieć od razu. Potwierdzenie każdego wysłania środków nadal jest wymagane.</p></section></div>}</div>;
}
