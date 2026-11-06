import { tr } from '../lib/i18n';
import { useState } from 'react';
import { ArrowUpRight, CheckCircle2, ExternalLink } from 'lucide-react';
import type { AssetIntent, AssetOperation, AssetQuote } from '../../electron/assets/types';
import type { WalletAPI } from '../../electron/types';
import { Button, CopyButton, ErrorMessage, Field, Modal, Tag } from './ui';
import { CryptoIcon } from './CryptoIcon';
import { numberText } from '../lib/preferences';
export function OperationResult({ result, api }: {
    result: AssetOperation;
    api: WalletAPI;
}) {
    return <div className="operation-result"><CheckCircle2 /><h3>{result.state === 'broadcast' ? tr("Operacja wys\u0142ana") : tr("Sprawd\u017A wynik operacji")}</h3><p className="muted small">{tr("Potwierdzenie wykonania sprawdzisz w eksploratorze sieci. Nie ponawiaj operacji, dop\u00F3ki nie sprawdzisz zapisanych identyfikator\u00F3w.")}</p><ErrorMessage error={result.error || ''}/>{result.hashes.map((hash, index) => <div className="operation-hash" key={hash}><span className="mono">{index + 1}. {hash.slice(0, 12)}…{hash.slice(-8)}</span><CopyButton value={hash} label={tr("Kopiuj identyfikator transakcji")}/><Button onClick={() => void api.openExplorer({ chain: result.chain, network: result.network, hash })}><ExternalLink size={15}/>{tr("Eksplorator")}</Button></div>)}{result.createdAddresses.length > 0 && <><h4>{tr("Planowane adresy NFT lub kolekcji")}</h4><p className="muted small">{tr("Adres powstanie po potwierdzeniu odpowiedniej transakcji.")}</p>{result.createdAddresses.map(address => <div className="operation-hash" key={address}><span className="mono wrap-anywhere">{address}</span><CopyButton value={address}/></div>)}</>}</div>;
}
export function AssetReview({ quote, api, onResult }: {
    quote: AssetQuote;
    api: WalletAPI;
    onResult: (result: AssetOperation) => void;
}) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    async function send() { if (busy)
        return; setBusy(true); setError(''); try {
        onResult(await api.assetSend(quote.id));
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <div className="asset-review"><div className="review-network"><CryptoIcon chain={quote.chain}/><Tag>{quote.chain} · {quote.network.toUpperCase()}</Tag></div><h3>{tr(quote.title)}</h3><dl><dt>{tr("Nadawca")}</dt><dd className="mono wrap-anywhere">{quote.from}</dd><dt>{tr(quote.feeLabel)}</dt><dd className="mono">{numberText(quote.fee)} {quote.chain==='RH'?'ETH':quote.chain}</dd><dt>{tr("Liczba transakcji")}</dt><dd>{quote.transactions}</dd></dl><div className="intent-details">{quote.details.map((detail, index) => <p className="wrap-anywhere" key={index}>{tr(detail)}</p>)}</div><p className="note">{tr("Wycena jest wa\u017Cna przez 90 sekund. Po potwierdzeniu aplikacja poka\u017Ce jeszcze systemowe okno z w\u0142a\u015Bciwymi danymi operacji.")}</p><ErrorMessage error={error}/><Button className="primary full" disabled={busy || Date.now() > quote.expires} onClick={() => void send()}>{busy ? tr("Oczekiwanie na wykonanie\u2026") : tr("Podpisz i wykonaj")}<ArrowUpRight size={17}/></Button></div>;
}
export default function AssetTransfer({ api, intent, onClose, onDone }: {
    api: WalletAPI;
    intent: AssetIntent;
    onClose: () => void;
    onDone: () => void;
}) {
    const [to, setTo] = useState(''), [amount, setAmount] = useState(intent.kind === 'nft' ? '1' : ''), [quote, setQuote] = useState<AssetQuote>(), [result, setResult] = useState<AssetOperation>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
    async function prepare() { if (intent.kind === 'mint' || busy)
        return; setBusy(true); setError(''); try {
        setQuote(await api.assetQuote({ ...intent, to: to.trim(), amount: amount.replace(',', '.') }));
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <Modal title={intent.kind === 'usdc'||intent.kind==='token' ? tr("Wy\u015Blij USDC") : tr("Wy\u015Blij NFT")} eyebrow={`${intent.chain} · ${intent.network.toUpperCase()}`} onClose={onClose}>{result ? <OperationResult result={result} api={api}/> : quote ? <AssetReview api={api} quote={quote} onResult={value => { setResult(value); onDone(); }}/> : <form onSubmit={e => { e.preventDefault(); void prepare(); }}><Field label={tr("Adres odbiorcy")}><input value={to} onChange={e => setTo(e.target.value)} placeholder={tr("Wklej adres odbiorcy")} required autoComplete="off"/></Field><Field label={intent.kind === 'usdc'||intent.kind==='token' ? tr("Kwota USDC") : tr("Ilo\u015B\u0107 NFT")}><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} readOnly={intent.kind === 'nft' && intent.standard !== 'ERC1155'} required/></Field><p className="note">{tr("Sprawd\u017A sie\u0107 i adres odbiorcy. USDC i NFT z r\u00F3\u017Cnych sieci nie s\u0105 wymienne przez zwyk\u0142y przelew.")}</p><ErrorMessage error={error}/><Button type="submit" className="primary full" disabled={busy}>{busy ? tr("Przygotowywanie\u2026") : tr("Dalej: podgl\u0105d kosztu")}</Button></form>}</Modal>;
}
