import { tr } from '../lib/i18n';
import { Brand } from './Brand';
import { useState } from 'react';
import { ArrowRight, Fingerprint, Plus, KeyRound } from 'lucide-react';
import type { Status, Network, WalletAPI } from '../../electron/types';
import { Button, Field, ErrorMessage } from './ui';
export function AppGate({ api, status, network, onReady }: {
    api: WalletAPI;
    status: Status;
    network: Network;
    onReady: (s: Status) => void;
}) {
    const [pin, setPin] = useState(''), [repeat, setRepeat] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const setup = !status.exists || status.needsMigration;
    async function submit() { setBusy(true); setError(''); try {
        if (setup && pin !== repeat)
            throw new Error(tr("Kody PIN nie s\u0105 takie same."));
        const s = status.needsMigration ? await api.migrate({ password, pin }) : status.exists ? await api.unlock(pin, network) : await api.initialize(pin);
        setPin('');
        setPassword('');
        setRepeat('');
        onReady(setup ? await api.status(network) : s);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <div className="app-gate"><Brand /><section className="panel onboard-form"><div className="lock-emblem"><Fingerprint size={54}/></div><h1>{status.needsMigration ? tr("Jeden PIN dla aplikacji") : setup ? tr("Ustaw PIN aplikacji") : tr("Odblokuj FRAME")}</h1><p className="muted">{status.needsMigration ? tr("Podaj dotychczasowe has\u0142o jeden raz, aby zachowa\u0107 portfel i przenie\u015B\u0107 go do nowego sejfu.") : setup ? tr("Ten PIN odblokuje wszystkie dodane portfele.") : tr("Wpisz PIN, aby uzyska\u0107 dost\u0119p do wszystkich portfeli.")}</p><form onSubmit={e => { e.preventDefault(); void submit(); }}>{status.needsMigration && <Field label={tr("Dotychczasowe has\u0142o portfela")}><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} maxLength={256} required/></Field>}<Field label={setup ? tr("Nowy PIN aplikacji") : 'PIN aplikacji'} hint={setup ? 'Od 6 do 12 cyfr. PIN jest dodatkowo chroniony przez systemowy magazyn kluczy.' : undefined}><input type="password" inputMode="numeric" autoFocus autoComplete="off" pattern="[0-9]{6,12}" minLength={6} maxLength={12} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} required/></Field>{setup && <Field label={tr("Powt\u00F3rz PIN")}><input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6,12}" maxLength={12} value={repeat} onChange={e => setRepeat(e.target.value.replace(/\D/g, ''))} required/></Field>}<ErrorMessage error={error}/><Button type="submit" className="primary full" disabled={busy}>{busy ? tr("Otwieranie sejfu\u2026") : setup ? tr("Zapisz PIN i otw\u00F3rz aplikacj\u0119") : tr("Odblokuj aplikacj\u0119")}<ArrowRight size={18}/></Button></form>{setup && <p className="muted small gate-note">{tr("PIN dzia\u0142a na tym urz\u0105dzeniu. Kopi\u0105 do odzyskania \u015Brodk\u00F3w pozostaje fraza seed ka\u017Cdego portfela i jego passphrase BIP39.")}</p>}</section></div>;
}
export default function Onboarding({ api, onReady, initialName = tr("Portfel"), onCancel }: {
    api: WalletAPI;
    onReady: (s: Status) => void;
    initialName?: string;
    onCancel?: () => void;
}) {
    const [mode, setMode] = useState<'start' | 'backup' | 'confirm' | 'import'>('start');
    const [seed, setSeed] = useState('');
    const [name, setName] = useState(initialName);
    const [passphrase, setPassphrase] = useState('');
    const [words, setWords] = useState(['', '']);
    const [ack, setAck] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function run(fn: () => Promise<void>) { setBusy(true); setError(''); try {
        await fn();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function finish() { if (!ack)
        throw new Error(tr("Potwierd\u017A zapisanie kopii zapasowej.")); const s = mode === 'import' ? await api.import({ mnemonic: seed, name, passphrase }) : await api.create({ name, passphrase, word3: words[0], word8: words[1] }); setSeed(''); setPassphrase(''); onReady(s); }
    return <section className="wallet-onboarding"><h2>{mode === 'backup' ? tr("Zapisz swoj\u0105 fraz\u0119") : mode === 'confirm' ? tr("Sprawd\u017A kopi\u0119") : mode === 'import' ? tr("Importuj portfel") : tr("Dodaj portfel")}</h2>{mode === 'start' && <><p className="muted small">{tr("Ka\u017Cdy portfel ma w\u0142asn\u0105 fraz\u0119 seed. Wszystkie odblokujesz jednym PIN-em aplikacji.")}</p><div className="start-options"><button disabled={busy} onClick={() => void run(async () => { setSeed(await api.generate()); setMode('backup'); })}><Plus /><div><strong>{tr("Utw\u00F3rz nowy portfel")}</strong><small>{tr("Nowa fraza BIP39")}</small></div><ArrowRight /></button><button disabled={busy} onClick={() => setMode('import')}><KeyRound /><div><strong>{tr("Importuj istniej\u0105cy")}</strong><small>{tr("Przywr\u00F3\u0107 fraz\u0119 BIP39")}</small></div><ArrowRight /></button></div></>}
 {mode === 'backup' && <><p className="muted small">{tr("Przepisz 24 s\u0142owa w tej kolejno\u015Bci. Zachowaj je offline i nikomu nie udost\u0119pniaj.")}</p><div className="seed-grid">{seed.split(' ').map((word, i) => <div key={i}><span>{i + 1}</span>{word}</div>)}</div><Button className="primary full" onClick={() => setMode('confirm')}>{tr("Mam zapisan\u0105 fraz\u0119 ")}<ArrowRight size={18}/></Button></>}
 {(mode === 'confirm' || mode === 'import') && <form onSubmit={e => { e.preventDefault(); void run(finish); }}><Field label={tr("Nazwa portfela")}><input value={name} maxLength={32} required onChange={e => setName(e.target.value)}/></Field>{mode === 'import' ? <Field label={tr("Fraza seed (12, 15, 18, 21 lub 24 s\u0142owa)")}><textarea value={seed} autoComplete="off" spellCheck={false} rows={3} onChange={e => setSeed(e.target.value)} required/></Field> : <div className="two-fields">{[3, 8].map((n, i) => <Field key={n} label={tr("S\u0142owo nr {0}", n)}><input value={words[i]} autoComplete="off" spellCheck={false} onChange={e => setWords(words.map((w, j) => i === j ? e.target.value : w))} required/></Field>)}</div>}<details><summary>{tr("Opcjonalna passphrase BIP39")}</summary><Field label="Passphrase BIP39" hint={tr("To dodatkowy sk\u0142adnik seeda, niezale\u017Cny od PIN-u. Przy imporcie podaj oryginaln\u0105 warto\u015B\u0107.")}><input type="password" maxLength={256} autoComplete="off" value={passphrase} onChange={e => setPassphrase(e.target.value)}/></Field></details><label className="check-row"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}/><span>{tr("Mam zapisan\u0105 fraz\u0119 oraz passphrase, je\u015Bli jej u\u017Cywam.")}</span></label><Button type="submit" className="primary full" disabled={busy}>{busy ? tr("Zapisywanie\u2026") : tr("Dodaj portfel")}<ArrowRight size={18}/></Button></form>}
 <ErrorMessage error={error}/>{mode !== 'start' && <button className="text-button" disabled={busy} onClick={() => { setSeed(''); setMode('start'); setError(''); }}>{tr("Wr\u00F3\u0107")}</button>}{onCancel && <button className="text-button cancel-add" disabled={busy} onClick={onCancel}>{tr("Anuluj dodawanie")}</button>}</section>;
}
