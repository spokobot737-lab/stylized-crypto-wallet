import { tr } from '../lib/i18n';
import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { IntegrationStatus, IntegrationKeys } from '../../electron/assets/types';
import type { WalletAPI } from '../../electron/types';
import { Button, ErrorMessage, Field } from './ui';
export default function IntegrationsSettings({ api }: {
    api?: WalletAPI;
}) {
    const [status, setStatus] = useState<IntegrationStatus>(), [values, setValues] = useState<IntegrationKeys>({}), [remove, setRemove] = useState<Partial<Record<keyof IntegrationKeys, boolean>>>({}), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
    useEffect(() => { let current = true; api?.integrations().then(value => { if (current)
        setStatus(value); }).catch(e => { if (current)
        setError(e.message); }); return () => { current = false; }; }, [api]);
    async function save() { if (!api || busy)
        return; setBusy(true); setError(''); setSaved(false); try {
        const input: Partial<Record<keyof IntegrationKeys, string | null>> = {};
        for (const name of ['alchemy', 'helius', 'pinata'] as const) {
            if (remove[name])
                input[name] = null;
            else if (values[name]?.trim())
                input[name] = values[name]!.trim();
        }
        setStatus(await api.saveIntegrations(input));
        setValues({});
        setRemove({});
        setSaved(true);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <section className="panel settings-panel integrations-panel"><h3><KeyRound size={18}/>{tr("Integracje")}</h3><p className="muted small">{tr("Alchemy pobiera NFT Ethereum, Helius pobiera NFT Solana. Pinata umożliwia wysyłanie grafik i metadanych do publicznego IPFS. Zapisane klucze są szyfrowane lokalnie przez system. Formularz jest czyszczony po zapisie, a aplikacja zwraca tylko status konfiguracji.")}</p>{(['alchemy', 'helius', 'pinata'] as const).map(name => <div className="integration-field" key={name}><Field label={name === 'alchemy' ? tr("Klucz Alchemy") : name === 'helius' ? tr("Klucz Helius") : tr("Token Pinata")} hint={status?.[name] ? tr("Skonfigurowano. Puste pole zachowuje obecny klucz.") : tr("Brak konfiguracji.")}><input aria-label={name === 'alchemy' ? tr("Klucz Alchemy") : name === 'helius' ? tr("Klucz Helius") : tr("Token Pinata")} type="password" autoComplete="off" value={values[name] || ''} onChange={e => { setValues({ ...values, [name]: e.target.value }); setSaved(false); }} placeholder={tr("Wklej w\u0142asny klucz API")} disabled={!api || busy}/></Field>{status?.[name] && <label className="check-row"><input type="checkbox" checked={!!remove[name]} onChange={e => setRemove({ ...remove, [name]: e.target.checked })}/><span>{tr("Usu\u0144 zapisany klucz")}</span></label>}</div>)}<p className="muted small">{tr("Dostawcy mog\u0105 wymaga\u0107 konta i maj\u0105 w\u0142asne limity. Udost\u0119pniasz im publiczne adresy portfela; frazy seed i klucze prywatne pozostaj\u0105 w aplikacji.")}</p><ErrorMessage error={error}/>{saved && <p role="status">{tr("Zapisano integracje.")}</p>}<Button className="primary" disabled={!api || busy} onClick={() => void save()}>{busy ? tr("Zapisywanie\u2026") : tr("Zapisz integracje")}</Button></section>;
}
