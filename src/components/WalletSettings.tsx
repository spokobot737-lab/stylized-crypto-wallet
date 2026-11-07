import { tr } from '../lib/i18n';
import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import type { Status, Network, WalletAPI } from '../../electron/types';
import { Button, ErrorMessage, Field, Modal } from './ui';
export function WalletManager({ api, status, network, onClose, onStatus, onAdd, onSwitch }: {
    api: WalletAPI;
    status: Status;
    network: Network;
    onClose: () => void;
    onStatus: (s: Status) => void;
    onAdd: () => void;
    onSwitch: (id: string) => Promise<void>;
}) {
    const [renameId, setRenameId] = useState(''), [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    async function rename() { setBusy(true); setError(''); try {
        onStatus(await api.renameWallet(renameId, name, network));
        setRenameId('');
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <Modal title={tr("Twoje portfele")} eyebrow={tr("PORTFELE")} onClose={onClose}><div className="wallet-list">{status.wallets.map(w => <div className="wallet-list-item" key={w.id}><button disabled={busy} className="wallet-list-select" onClick={() => { setBusy(true); void onSwitch(w.id).then(onClose).catch(e => setError(e.message)).finally(() => setBusy(false)); }}><span>{w.name}</span>{w.id === status.activeWalletId && <Check size={17}/>}</button><button className="text-button" disabled={busy} onClick={() => { setRenameId(w.id); setName(w.name); }}>{tr("Zmie\u0144 nazw\u0119")}</button></div>)}</div>{renameId && <form onSubmit={e => { e.preventDefault(); void rename(); }}><Field label={tr("Nowa nazwa portfela")}><input value={name} maxLength={32} required onChange={e => setName(e.target.value)}/></Field><Button type="submit" disabled={busy || !name.trim()}>{tr("Zapisz nazw\u0119")}</Button></form>}<ErrorMessage error={error}/><Button className="primary full" disabled={busy} onClick={onAdd}><Plus size={17}/>{tr(" Dodaj portfel")}</Button></Modal>;
}
export function PinSettings({ api, onClose }: {
    api: WalletAPI;
    onClose: () => void;
}) {
    const [oldPin, setOldPin] = useState(''), [pin, setPin] = useState(''), [repeat, setRepeat] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
    async function submit() { setBusy(true); setError(''); try {
        if (pin !== repeat)
            throw new Error(tr("Nowe kody PIN nie s\u0105 takie same."));
        await api.changePin(oldPin, pin);
        setOldPin('');
        setPin('');
        setRepeat('');
        setDone(true);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <Modal title={tr("Zmie\u0144 PIN aplikacji")} eyebrow={tr("BEZPIECZE\u0143STWO")} onClose={busy ? () => { } : onClose}>{done ? <><p>{tr("PIN zosta\u0142 zmieniony dla wszystkich portfeli.")}</p><Button className="primary full" onClick={onClose}>{tr("Gotowe")}</Button></> : <form onSubmit={e => { e.preventDefault(); void submit(); }}>{[{ label: tr("Obecny PIN"), value: oldPin, set: setOldPin }, { label: tr("Nowy PIN"), value: pin, set: setPin }, { label: tr("Powt\u00F3rz nowy PIN"), value: repeat, set: setRepeat }].map(f => <Field key={f.label} label={f.label}><input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6,12}" minLength={6} maxLength={12} value={f.value} onChange={e => f.set(e.target.value.replace(/\D/g, ''))} required/></Field>)}<ErrorMessage error={error}/><Button type="submit" className="primary full" disabled={busy}>{busy ? tr("Zapisywanie\u2026") : tr("Zapisz PIN")}</Button></form>}</Modal>;
}
