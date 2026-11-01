import { tr } from '../lib/i18n';
import { useState } from 'react';
import { UploadCloud, Sparkles } from 'lucide-react';
import type { AssetChain, AssetIntent, AssetQuote, MintItem, MetadataUpload } from '../../electron/assets/types';
import type { Network, WalletAPI } from '../../electron/types';
import { Button, ErrorMessage, Field, Modal } from './ui';
import { AssetReview, OperationResult } from './AssetOperation';
import type { AssetOperation } from '../../electron/assets/types';
export default function MintPanel({ api, chain, network, onDone }: {
    api: WalletAPI;
    chain: AssetChain;
    network: Network;
    onDone: () => void;
}) {
    const [mode, setMode] = useState<'single' | 'collection' | 'batch'>('single'), [name, setName] = useState(''), [symbol, setSymbol] = useState('FRAME'), [uri, setUri] = useState(''), [collection, setCollection] = useState(''), [description, setDescription] = useState(''), [manifest, setManifest] = useState(''), [file, setFile] = useState<File>(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [quote, setQuote] = useState<AssetQuote>(), [result, setResult] = useState<AssetOperation>();
    async function upload() { if (!file || busy)
        return; setBusy(true); setError(''); try {
        if (file.size > 5 * 1024 * 1024)
            throw new Error(tr("Maksymalny rozmiar obrazu to 5 MB."));
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
            throw new Error(tr("Wybierz obraz PNG, JPEG lub WebP."));
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        const result = await api.uploadMetadata({ name, description, imageBase64: btoa(binary), mime: file.type as MetadataUpload['mime'] });
        setUri(result.uri);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function prepare() { if (busy)
        return; setBusy(true); setError(''); try {
        let items: MintItem[] = [];
        if (mode === 'batch') {
            const parsed = JSON.parse(manifest);
            if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 20)
                throw new Error(tr("Manifest musi zawiera\u0107 od 1 do 20 element\u00F3w."));
            items = parsed;
        }
        const intent: AssetIntent = { kind: 'mint', chain, network, mode, name: name.trim(), symbol: symbol.trim(), uri: uri.trim(), ...(collection.trim() ? { collection: collection.trim() } : {}), items };
        setResult(undefined);
        setQuote(await api.assetQuote(intent));
    }
    catch (e) {
        setError(e instanceof SyntaxError ? tr("Manifest nie jest poprawnym plikiem JSON.") : (e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <div className="mint-panel panel"><div className="mint-intro"><Sparkles /><div><h2>{tr("Utw\u00F3rz NFT")}</h2><p className="muted small">{tr("Ethereum: ERC-721. Solana: Metaplex Core. Kolekcj\u0119 utworzysz najpierw, a nast\u0119pnie dodasz do niej seri\u0119 NFT.")}</p></div></div><div className="settings-tabs mint-modes">{([['single', tr("Pojedynczy NFT")], ['collection', tr("Nowa kolekcja")], ['batch', tr("Seria w kolekcji")]] as const).map(([value, label]) => <button key={value} aria-pressed={mode === value} className={mode === value ? 'active' : ''} onClick={() => { setMode(value); setError(''); }}>{label}</button>)}</div><form onSubmit={e => { e.preventDefault(); void prepare(); }}><div className="mint-fields"><Field label={tr("Nazwa")}><input value={name} onChange={e => setName(e.target.value)} placeholder={tr("Nazwa NFT lub kolekcji")} maxLength={32} required/></Field><Field label={tr("Symbol")}><input value={symbol} onChange={e => setSymbol(e.target.value)} maxLength={10} required/></Field>{mode !== 'collection' && <Field label={mode === 'batch' ? tr("Adres kolekcji") : tr("Adres kolekcji (opcjonalnie dla Solany)")}><input value={collection} onChange={e => setCollection(e.target.value)} placeholder={tr("Wklej adres istniej\u0105cej kolekcji")} disabled={mode === 'single' && chain === 'ETH'} required={mode === 'batch'}/></Field>}</div>{mode === 'batch' ? <Field label={tr("Manifest NFT (JSON)")} hint={tr("Od 1 do 20 element\u00F3w. Ka\u017Cdy element zawiera name oraz uri z publicznymi metadanymi. Ethereum obs\u0142uguje kolekcje utworzone w FRAME.")}><textarea rows={7} value={manifest} onChange={e => setManifest(e.target.value)} placeholder={'[{"name":"Nazwa NFT","uri":"ipfs://adres-metadanych"}]'} required/></Field> : <><Field label={tr("Adres metadanych JSON")} hint={tr("Publiczny adres IPFS lub HTTPS, maksymalnie 200 znak\u00F3w.")}><input value={uri} onChange={e => setUri(e.target.value)} placeholder="ipfs://adres-metadanych" maxLength={200} required/></Field><details className="upload-box"><summary><UploadCloud size={17}/>{tr("Prze\u015Blij grafik\u0119 i metadane do IPFS")}</summary><Field label={tr("Opis")}><textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={1000}/></Field><Field label={tr("Grafika (PNG, JPEG lub WebP, do 5 MB)")}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setFile(e.target.files?.[0])}/></Field><p className="muted small">{tr("Pliki b\u0119d\u0105 publicznie dost\u0119pne w IPFS. Wymagany w\u0142asny token Pinata w ustawieniach. Przes\u0142anie plik\u00F3w nie mintuje NFT.")}</p><Button type="button" disabled={busy || !file || !name.trim()} onClick={() => void upload()}>{busy ? tr("Przesy\u0142anie\u2026") : tr("Prze\u015Blij do publicznego IPFS")}</Button></details></>}<ErrorMessage error={error}/><div className="mint-submit"><p className="muted small">{tr("Koszt w ")}{chain}{tr(" zobaczysz przed podpisaniem. NFT trafiaj\u0105 na adres aktywnego portfela.")}</p><Button type="submit" className="primary" disabled={busy}>{busy ? tr("Przygotowywanie\u2026") : tr("Sprawd\u017A koszt mintowania")}</Button></div></form>{quote && <Modal title={tr("Potwierd\u017A mintowanie")} eyebrow={`${chain} · ${network.toUpperCase()}`} onClose={() => setQuote(undefined)}>{result ? <OperationResult api={api} result={result}/> : <AssetReview quote={quote} api={api} onResult={value => { setResult(value); if (value.state === 'broadcast' && mode === 'collection' && value.createdAddresses[0]) {
        setCollection(value.createdAddresses[0]);
        setMode('batch');
    } onDone(); }}/>}</Modal>}</div>;
}
