import { tr } from '../lib/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Image as ImageIcon, RefreshCw, Search, Sparkles } from 'lucide-react';
import type { Account, Network, WalletAPI } from '../../electron/types';
import type { AssetChain, AssetOperation, Nft, NftPage, NftQuery } from '../../electron/assets/types';
import { CryptoIcon } from './CryptoIcon';
import { Button, CopyButton, ErrorMessage, Field, Modal, Tag } from './ui';
import { ReceiveModal } from './TransferModal';
import AssetTransfer from './AssetOperation';
import MintPanel from './MintPanel';
function Thumbnail({ nft, api }: {
    nft: Nft;
    api: WalletAPI;
}) { const [image, setImage] = useState(''); useEffect(() => { let active = true; setImage(''); if (nft.image)
    api.nftImage(nft.image).then(data => { if (active)
        setImage(data); }).catch(() => { }); return () => { active = false; }; }, [nft.image, api]); return <div className="nft-thumbnail">{image ? <img src={image} alt={nft.name} loading="lazy"/> : <ImageIcon size={40}/>}</div>; }
export default function NftDashboard({ api, network, accounts, walletId, onSettings }: {
    api: WalletAPI;
    network: Network;
    accounts: Account[];
    walletId: string;
    onSettings: () => void;
}) {
    const [tab, setTab] = useState<'owned' | 'explore' | 'mint'>('owned'), [chain, setChain] = useState<AssetChain>('ETH'), [page, setPage] = useState<NftPage>({ items: [] }), [query, setQuery] = useState(''), [tokenId, setTokenId] = useState(''), [scope, setScope] = useState<'asset' | 'collection'>('collection'), [filter, setFilter] = useState(''), [loading, setLoading] = useState(false), [error, setError] = useState(''), [selected, setSelected] = useState<Nft>(), [send, setSend] = useState<Nft>(), [receive, setReceive] = useState(false), [operations, setOperations] = useState<AssetOperation[]>([]);
    const request = useRef(0), search = useRef({ query: '', tokenId: '', scope: 'collection' as 'asset' | 'collection' });
    const load = useCallback(async (cursor?: string) => { if (tab === 'mint')
        return; const version = ++request.current; setLoading(true); setError(''); if (!cursor)
        setPage({ items: [] }); try {
        const input: NftQuery = { chain, network, mode: tab, ...(tab === 'explore' ? search.current : {}), ...(cursor ? { cursor } : {}) };
        const value = await api.nfts(input);
        if (version === request.current)
            setPage(old => ({ ...value, items: cursor ? [...new Map([...old.items, ...value.items].map(nft => [nft.id, nft])).values()] : value.items }));
    }
    catch (e) {
        if (version === request.current)
            setError((e as Error).message);
    }
    finally {
        if (version === request.current)
            setLoading(false);
    } }, [api, chain, network, tab, walletId]);
    const refreshOperations = useCallback(() => { let active = true; api.assetOperations().then(value => { if (active)
        setOperations(value.slice(0, 6)); }).catch(() => { }); return () => { active = false; }; }, [api, walletId]);
    useEffect(() => { setPage({ items: [] }); setSelected(undefined); setSend(undefined); setReceive(false); setError(''); search.current = { query: '', tokenId: '', scope: 'collection' }; setQuery(''); setTokenId(''); if (tab === 'owned')
        void load(); return () => { request.current++; }; }, [load, tab]);
    useEffect(refreshOperations, [refreshOperations]);
    function done() { refreshOperations(); if (tab === 'owned')
        void load(); }
    function explore() { search.current = { query: query.trim(), tokenId: tokenId.trim(), scope }; void load(); }
    return <section className="nft-page"><div className="wallet-heading"><div><div className="eyebrow">{network.toUpperCase()} · NFT</div><h1>{tr("Twoje NFT")}</h1></div><div className="wallet-heading-actions"><Button className="primary" onClick={() => setReceive(true)}><ArrowDownLeft size={17}/>{tr("Odbierz NFT")}</Button><Button onClick={onSettings}>{tr("Integracje")}</Button></div></div><div className="nft-controls"><div className="settings-tabs">{([['owned', tr("Posiadane")], ['explore', tr("Odkrywaj")], ['mint', tr("Utw\u00F3rz")]] as const).map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} aria-pressed={tab === value} onClick={() => setTab(value)}>{value === 'mint' ? <Sparkles size={17}/> : value === 'explore' ? <Search size={17}/> : <ImageIcon size={17}/>} {label}</button>)}</div><div className="nft-chain-switch" aria-label={tr("Sie\u0107 NFT")}>{(['ETH', 'SOL'] as const).map(value => <button key={value} className={chain === value ? 'active' : ''} aria-pressed={chain === value} onClick={() => setChain(value)}><CryptoIcon chain={value} size={22}/>{value === 'ETH' ? 'Ethereum' : 'Solana'}</button>)}</div></div>{tab === 'mint' ? <MintPanel api={api} chain={chain} network={network} onDone={done}/> : <>{tab === 'explore' && <form className="panel nft-search" onSubmit={e => { e.preventDefault(); explore(); }}>{chain === 'SOL' && <Field label={tr("Szukaj wed\u0142ug")}><select value={scope} onChange={e => setScope(e.target.value as typeof scope)}><option value="collection">{tr("Adres kolekcji")}</option><option value="asset">{tr("Adres NFT")}</option></select></Field>}<Field label={chain === 'ETH' ? tr("Adres kontraktu kolekcji") : tr("Adres NFT lub kolekcji")}><input value={query} onChange={e => setQuery(e.target.value)} placeholder={tr("Wklej publiczny adres")} required/></Field>{chain === 'ETH' && <Field label={tr("Identyfikator NFT (opcjonalnie)")}><input value={tokenId} onChange={e => setTokenId(e.target.value)} inputMode="numeric" placeholder={tr("Wszystkie elementy kolekcji")}/></Field>}<Button type="submit" className="primary" disabled={loading}><Search size={17}/>{tr("Szukaj NFT")}</Button></form>}<div className="nft-list-toolbar"><p className="muted small">{tab === 'owned' ? tr('NFT przypisane do aktywnego adresu portfela.') : tr("Podgl\u0105d publicznych NFT i kolekcji. Wyszukiwanie nie oznacza w\u0142asno\u015Bci.")}</p><div><input aria-label={tr("Filtruj NFT po nazwie")} placeholder={tr("Filtruj po nazwie")} value={filter} onChange={e => setFilter(e.target.value)}/><button className="text-button" disabled={loading || (tab === 'explore' && !search.current.query)} onClick={() => void load()}><RefreshCw size={16}/>{loading ? tr("Pobieranie\u2026") : tr("Od\u015Bwie\u017C NFT")}</button></div></div><ErrorMessage error={error}/>{page.warning && <p className="note">{tr(page.warning)}</p>}{!loading && !error && !page.items.length && <div className="nft-empty panel"><ImageIcon size={38}/><h3>{tab === 'owned' ? tr("Brak NFT do wy\u015Bwietlenia") : tr("Odkryj kolekcj\u0119")}</h3><p className="muted">{tab === 'owned' ? tr("Sprawd\u017A sie\u0107 i konfiguracj\u0119 indeksu w Integracjach.") : tr("Wklej adres kolekcji lub konkretnego NFT.")}</p></div>}<div className="nft-grid">{page.items.filter(nft => nft.name.toLowerCase().includes(filter.toLowerCase())).map(nft => <article className="nft-card panel" key={nft.id} data-testid={`nft-${nft.chain}`}><button className="nft-open" onClick={() => setSelected(nft)} aria-label={tr("Szczeg\u00F3\u0142y NFT {0}", nft.name)}><Thumbnail nft={nft} api={api}/><div className="nft-card-info"><div><Tag>{nft.standard}</Tag><CryptoIcon chain={nft.chain} size={22}/></div><h3>{nft.name}</h3><p className="mono muted small">{nft.tokenId ? `#${nft.tokenId}` : nft.address.slice(0, 8) + '…'}</p></div></button><div className="nft-card-actions"><CopyButton value={nft.address}/><Button disabled={!nft.transferable} onClick={() => setSend(nft)}><ArrowUpRight size={16}/>{tr("Wy\u015Blij NFT")}</Button></div></article>)}</div>{page.cursor && <Button disabled={loading} onClick={() => void load(page.cursor)}>{loading ? tr("Pobieranie\u2026") : tr("Wczytaj kolejne NFT")}</Button>}</>}{operations.length > 0 && <section className="nft-operations panel"><h3>{tr("Ostatnie operacje NFT i USDC")}</h3>{operations.map(operation => <div className="operation-history-row" key={operation.id}><CryptoIcon chain={operation.chain} size={24}/><div><strong>{tr(operation.title)}</strong><p className="muted small">{operation.network.toUpperCase()} · {operation.state === 'broadcast' ? tr("Rozg\u0142oszono") : operation.state === 'partial' ? tr("Wykonano cz\u0119\u015B\u0107 serii") : tr("Sprawd\u017A wynik w sieci")}</p></div>{operation.hashes[0] && <Button onClick={() => void api.openExplorer({ chain: operation.chain, network: operation.network, hash: operation.hashes[0] })}><ExternalLink size={15}/>{tr("Eksplorator")}</Button>}</div>)}</section>}{selected && <Modal title={selected.name} eyebrow={`${selected.chain} · ${network.toUpperCase()}`} onClose={() => setSelected(undefined)}><Thumbnail nft={selected} api={api}/><p>{selected.description}</p><dl><dt>Standard</dt><dd>{selected.standard}</dd><dt>{tr("Adres NFT lub kontraktu")}</dt><dd className="mono wrap-anywhere">{selected.address}<CopyButton value={selected.address}/></dd>{selected.tokenId && <><dt>{tr("Identyfikator NFT")}</dt><dd className="mono">{selected.tokenId}</dd></>}</dl>{selected.warning && <p className="note">{tr(selected.warning)}</p>}<Button className="primary full" disabled={!selected.transferable} onClick={() => { setSend(selected); setSelected(undefined); }}>{tr("Wy\u015Blij NFT")}</Button></Modal>}{send && <AssetTransfer api={api} intent={{ kind: 'nft', chain: send.chain, network, address: send.address, tokenId: send.tokenId, standard: send.standard, to: '', amount: '1' }} onClose={() => setSend(undefined)} onDone={done}/>} {receive && <ReceiveModal accounts={accounts} chain={chain} onClose={() => setReceive(false)}/>}</section>;
}
