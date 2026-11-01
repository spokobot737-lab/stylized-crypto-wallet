import { tr } from '../lib/i18n';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CryptoIcon } from './CryptoIcon';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { Account, Chain, Network, Quote, Transfer, WalletAPI } from '../../electron/types';
import { Button, CopyButton, ErrorMessage, Field, Modal, Tag } from './ui';
export function ReceiveModal({ accounts, chain, onClose }: {
    accounts: Account[];
    chain: Chain;
    onClose: () => void;
}) {
    const [selected, setSelected] = useState(chain);
    const [qr, setQr] = useState('');
    const account = accounts.find(a => a.chain === selected)!;
    useEffect(() => { let active = true; setQr(''); QRCode.toDataURL(account.address, { width: 260, margin: 2, color: { dark: '#101116', light: '#ffffff' }, errorCorrectionLevel: 'M' }).then(url => { if (active)
        setQr(url); }); return () => { active = false; }; }, [account.address]);
    return <Modal title={tr("Odbierz \u015Brodki")} eyebrow="INCOMING / ADDRESS" onClose={onClose}><div className="chain-tabs">{accounts.map(a => <button key={a.chain} className={a.chain === selected ? 'active' : ''} onClick={() => setSelected(a.chain)}><CryptoIcon chain={a.chain} size={18}/>{a.chain}</button>)}</div><div className="receive-network"><Tag>{account.networkLabel}</Tag></div><div className="qr-wrap">{qr ? <img src={qr} alt={tr("Kod QR adresu {0}", selected)} width={240} height={240}/> : <span>{tr("Generowanie kodu\u2026")}</span>}</div><div className="address-box mono"><span>{account.address}</span><CopyButton value={account.address}/></div><div className="note">{tr("Adres dla ")}{selected}{tr(" w sieci ")}{account.networkLabel}{tr('. Ethereum i Solana obsługują też USDC oraz zgodne NFT. Zawsze sprawdź sieć nadawcy.')}</div><p className="muted small mono">{tr("\u015Acie\u017Cka: ")}{account.path}</p></Modal>;
}
export function SendModal({ api, network, chain, accounts, onClose, onSent }: {
    api: WalletAPI;
    network: Network;
    chain: Chain;
    accounts: Account[];
    onClose: () => void;
    onSent: (t: Transfer) => void;
}) {
    const [selected, setSelected] = useState(chain);
    const [to, setTo] = useState('');
    const [amount, setAmount] = useState('');
    const [quote, setQuote] = useState<Quote>();
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState<Transfer>();
    const [now, setNow] = useState(Date.now());
    useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
    async function prepare() { setBusy(true); setError(''); try {
        setQuote(await api.quote({ chain: selected, network, to: to.trim(), amount: amount.replace(',', '.') }));
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function send() { if (!quote)
        return; setBusy(true); setError(''); try {
        const t = await api.send(quote.id);
        setSent(t);
        onSent(t);
        setQuote(undefined);
    }
    catch (e) {
        setError((e as Error).message);
        setQuote(undefined);
    }
    finally {
        setBusy(false);
    } }
    const account = accounts.find(a => a.chain === selected)!;
    return <Modal title={sent ? tr("Transakcja rozg\u0142oszona") : quote ? tr("Sprawd\u017A ka\u017Cdy szczeg\u00F3\u0142") : tr("Wy\u015Blij \u015Brodki")} eyebrow="OUTGOING / TRANSFER" onClose={busy ? () => { } : onClose}>{sent ? <div className="success-view"><CheckCircle2 size={64}/><h3>{sent.amount} {sent.chain}</h3><p>{tr("Przelew wys\u0142ano do sieci. Rozg\u0142oszenie nie oznacza jeszcze potwierdzenia.")}</p><div className="address-box mono">{sent.hash}</div><Button className="primary full" onClick={() => void api.openExplorer(sent)}>{tr("Sprawd\u017A w eksploratorze ")}<ArrowUpRight size={18}/></Button></div> : quote ? <><Tag tone={network === 'mainnet' ? 'warning' : ''}>{quote.networkLabel}</Tag><div className="review-amount">{quote.amount} <span>{quote.chain}</span></div><dl className="review-list"><dt>{tr("Z adresu")}</dt><dd className="mono">{quote.from}</dd><dt>{tr("Na adres")}</dt><dd className="mono">{quote.to}</dd><dt>{tr(quote.feeLabel)}</dt><dd>{quote.fee} {quote.chain}</dd><dt>{tr("Wa\u017Cno\u015B\u0107 wyceny")}</dt><dd>{Math.max(0, Math.ceil((quote.expires - now) / 1000))} s</dd></dl><div className="note"><ShieldCheck size={17}/>{tr(" Kolejny krok otworzy systemowe potwierdzenie. Przelew jest nieodwracalny.")}</div><ErrorMessage error={error}/><Button className="primary full" disabled={busy || now >= quote.expires} onClick={() => void send()}>{busy ? tr("Podpisywanie i wysy\u0142anie\u2026") : tr("Potwierd\u017A przelew")}<ArrowUpRight size={18}/></Button><button className="text-button" disabled={busy} onClick={() => { setQuote(undefined); }}>{tr("Popraw dane")}</button></> : <form onSubmit={e => { e.preventDefault(); void prepare(); }}><div className="chain-tabs">{accounts.map(a => <button type="button" key={a.chain} className={a.chain === selected ? 'active' : ''} onClick={() => { setSelected(a.chain); setTo(''); setAmount(''); setError(''); }}><CryptoIcon chain={a.chain} size={18}/>{a.chain}</button>)}</div><Tag tone={network === 'mainnet' ? 'warning' : ''}>{account.networkLabel}</Tag><Field label={tr("Adres odbiorcy")}><input autoComplete="off" spellCheck={false} value={to} onChange={e => setTo(e.target.value)} placeholder={`Adres ${selected}`} maxLength={128} required/></Field><Field label={tr("Kwota ({0})", selected)} hint={tr("Zostaw \u015Brodki na op\u0142at\u0119 sieciow\u0105.")}><input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" maxLength={40} required/></Field><ErrorMessage error={error}/><Button type="submit" className="primary full" disabled={busy}>{busy ? tr("Sprawdzanie sieci i op\u0142aty\u2026") : tr("Dalej: podgl\u0105d op\u0142aty")}<ArrowUpRight size={18}/></Button><p className="muted small">{selected === 'BTC' ? tr("BTC: natywny SegWit, potwierdzone UTXO, reszta wraca na Tw\u00F3j adres.") : selected === 'ETH' ? tr("ETH: przelewy na zwyk\u0142e konta. ERC-20 i kontrakty nie s\u0105 obs\u0142ugiwane.") : tr("SOL: natywne SOL na zwyk\u0142e adresy. Tokeny SPL nie s\u0105 obs\u0142ugiwane.")}</p></form>}</Modal>;
}
export function BackupModal({ api, onClose }: {
    api: WalletAPI;
    onClose: () => void;
}) {
    const [password, setPassword] = useState('');
    const [secret, setSecret] = useState<{
        mnemonic: string;
        passphrase: string;
    }>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { if (!secret)
        return; const id = setTimeout(() => { setSecret(undefined); setPassword(''); }, 30000); return () => clearTimeout(id); }, [secret]);
    return <Modal title={tr("Kopia zapasowa")} eyebrow="OFFLINE BACKUP / PRIVATE" onClose={onClose}>{secret ? <><div className="note">{tr("Fraza zostanie ukryta po 30 sekundach. Zapisz j\u0105 offline. Ka\u017Cdy, kto j\u0105 pozna, mo\u017Ce przej\u0105\u0107 \u015Brodki.")}</div><div className="seed-grid">{secret.mnemonic.split(' ').map((w, i) => <div key={i}><span>{i + 1}</span>{w}</div>)}</div><Field label="Passphrase BIP39"><div className="address-box mono">{secret.passphrase || '(brak)'}</div></Field><Button className="primary full" onClick={() => { setSecret(undefined); onClose(); }}>{tr("Ukryj fraz\u0119")}</Button></> : <form onSubmit={e => { e.preventDefault(); setBusy(true); setError(''); api.reveal(password).then(setSecret).catch(e => setError(e.message)).finally(() => { setPassword(''); setBusy(false); }); }}><p className="muted">{tr("Poka\u017C fraz\u0119 tylko w prywatnym miejscu. Nie przesy\u0142aj jej do pomocy technicznej.")}</p><Field label="PIN aplikacji"><input type="password" inputMode="numeric" autoComplete="off" value={password} onChange={e => setPassword(e.target.value.replace(/\D/g, ''))} required minLength={6} maxLength={12}/></Field><ErrorMessage error={error}/><Button className="primary full" disabled={busy}>{tr("Poka\u017C fraz\u0119")}</Button></form>}</Modal>;
}
