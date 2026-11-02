import { useEffect, useRef, useState } from 'react';
import { initial, step, score, RULES, type State, type RunSession } from '../../shared/frame-run/simulation';
import type { WalletAPI } from '../../electron/types';
import { Button, Field } from './ui';
import { draw } from './frame-run-renderer';
export default function FrameRun({ api, context }: {
    api?: WalletAPI;
    context: string;
}) {
    const canvas = useRef<HTMLCanvasElement>(null), live = useRef<{
        s: State;
        inputs: number[];
        session?: RunSession;
        mode: string;
    } | undefined>(undefined), jump = useRef(false), raf = useRef(0), mounted = useRef(true), muted = useRef(localStorage.getItem('frame:run:muted') !== 'false'), audio = useRef<AudioContext | null>(null);
    const pendingExit = useRef(false);
    const [phase, setPhase] = useState('start'), [status, setStatus] = useState<any>(), [result, setResult] = useState<any>(), [error, setError] = useState(''), [mute, setMute] = useState(muted.current), [best, setBest] = useState(() => Number(localStorage.getItem('frame:run:best')) || 0), [url, setUrl] = useState('http://127.0.0.1:8787'), [token, setToken] = useState('');
    pendingExit.current = !!status?.pending || result?.state === 'pending' || phase === 'verifying';
    async function refresh() { try {
        const s = await api?.frameRun({ action: 'status' });
        if (mounted.current)
            setStatus(s);
    }
    catch (e) {
        if (mounted.current)
            setError((e as Error).message);
    } }
    function abandon() { cancelAnimationFrame(raf.current); const run = live.current; live.current = undefined; if (run?.session)
        void api?.frameRun({ action: 'cancel', runId: run.session.runId }).catch(() => { }); }
    useEffect(() => { mounted.current = true; void refresh(); const hide = () => { if (document.hidden && live.current) {
        abandon();
        setResult({ state: 'rejected', frame: 0, reason: 'Opuszczono ekran. Runda zakończona bez punktów.' });
        setPhase('result');
    } }; document.addEventListener('visibilitychange', hide); const timer = setInterval(() => { if (!document.hidden && !live.current && !pendingExit.current)
        void refresh(); }, 30000); return () => { clearInterval(timer); mounted.current = false; abandon(); document.removeEventListener('visibilitychange', hide); void audio.current?.close(); }; }, [context]);
    async function finish(run: NonNullable<typeof live.current>) { live.current = undefined; const points = score(run.s.tick); if (run.mode === 'practice') {
        setBest(b => { const n = Math.max(b, points); localStorage.setItem('frame:run:best', String(n)); return n; });
        setResult({ state: 'practice', score: points, frame: 0 });
        setPhase('result');
        return;
    } setPhase('verifying'); try {
        const r = await api!.frameRun({ action: 'settle', payload: { runId: run.session!.runId, version: 1, generator: 1, inputFormat: 1, endTick: run.s.tick, inputs: run.inputs } });
        if (mounted.current) {
            setResult(r);
            setPhase('result');
            void refresh();
        }
    }
    catch (e) {
        if (mounted.current) {
            setError((e as Error).message);
            setResult({ state: 'pending', score: points, frame: 0 });
            setPhase('result');
            void refresh();
        }
    } }
    async function start(mode: string) {
        setError('');
        setPhase('loading');
        try {
            const session = mode === 'reward' ? await api!.frameRun({ action: 'start' }) as RunSession : undefined;
            if (!mounted.current) {
                if (session)
                    void api?.frameRun({ action: 'cancel', runId: session.runId }).catch(() => { });
                return;
            }
            if (session && (JSON.stringify(session.rules) !== JSON.stringify(RULES))) {
                await api?.frameRun({ action: 'cancel', runId: session.runId });
                throw Error('Serwer wymaga aktualizacji zasad klienta.');
            }
            const run = { s: initial(session?.seed ?? crypto.getRandomValues(new Uint32Array(1))[0]), inputs: [] as number[], mode, session };
            live.current = run;
            jump.current = false;
            setPhase('playing');
            let previous = performance.now(), acc = 0;
            const frame = (now: number) => { if (live.current !== run)
                return; acc += now - previous; previous = now; if (acc > 1000) {
                abandon();
                setResult({ state: 'rejected', frame: 0, reason: 'Przerwa w działaniu rundy. Zagraj ponownie.' });
                setPhase('result');
                return;
            } while (acc >= 1000 / 60 && !run.s.ended) {
                const press = jump.current;
                jump.current = false;
                if (press) {
                    if (run.inputs.length < 600)
                        run.inputs.push(run.s.tick);
                }
                step(run.s, press);
                acc -= 1000 / 60;
            } const ctx = canvas.current?.getContext('2d'); if (ctx)
                draw(ctx, run.s); if (run.s.ended) {
                void finish(run);
                return;
            } raf.current = requestAnimationFrame(frame); };
            raf.current = requestAnimationFrame(frame);
        }
        catch (e) {
            setError((e as Error).message);
            setPhase('start');
        }
    }
    function input() { if (!live.current)
        return; jump.current = true; if (!muted.current) {
        audio.current ??= new AudioContext();
        void audio.current.resume();
        const osc = audio.current.createOscillator(), gain = audio.current.createGain();
        osc.connect(gain);
        gain.connect(audio.current.destination);
        gain.gain.setValueAtTime(.025, audio.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001, audio.current.currentTime + .08);
        osc.frequency.value = 520;
        osc.start();
        osc.stop(audio.current.currentTime + .08);
    } }
    useEffect(() => { const key = (e: KeyboardEvent) => { if (e.code === 'Space' && live.current && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        if (!e.repeat)
            input();
    } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, []);
    async function retry() { setPhase('verifying'); setError(''); try {
        const r = await api!.frameRun({ action: 'retry' });
        if (mounted.current) {
            setResult(r);
            setPhase('result');
            void refresh();
        }
    }
    catch (e) {
        if (mounted.current) {
            setError((e as Error).message);
            setPhase('result');
        }
    } }
    return <section className={`frame-run ${phase === 'playing' ? 'run-playing' : ''}`}><header><div><small>ZRĘCZNOŚĆ · DO 90 SEKUND</small><h1>FRAME Run</h1></div><Button onClick={() => { muted.current = !muted.current; setMute(muted.current); localStorage.setItem('frame:run:muted', String(muted.current)); }} aria-pressed={mute}>{mute ? 'Dźwięk wyłączony' : 'Dźwięk włączony'}</Button></header><p className="run-intro">Punkty FRAME są wewnętrznymi punktami aplikacji. Nie mają deklarowanej wartości finansowej.</p>{error && <p role="alert" className="note">{error}</p>}
 <div className="run-stage"><canvas ref={canvas} width={1000} height={300} tabIndex={0} aria-label="FRAME Run. Kliknij, dotknij lub naciśnij spację, aby skoczyć." onPointerDown={e => { e.preventDefault(); canvas.current?.focus(); input(); }}/>{phase !== 'playing' && <div className="run-overlay">{phase === 'start' ? <><h2>Przeskocz swój rekord.</h2><p>Dotyk, kliknięcie lub spacja. Przeszkody przyspieszają.</p></> : phase === 'loading' || phase === 'verifying' ? <h2>{phase === 'verifying' ? 'Weryfikacja na serwerze…' : 'Przygotowanie rundy…'}</h2> : <><h2>{result?.state === 'approved' ? 'Runda zatwierdzona' : result?.state === 'pending' ? 'Wynik oczekuje na wysłanie' : result?.state === 'expired' ? 'Sesja wygasła' : result?.state === 'rejected' ? 'Runda odrzucona' : 'Wynik treningu'}</h2><p>Wynik: {result?.score ?? 0} · Rekord: {result?.state === 'practice' ? Math.max(best, result.score) : status?.best ?? 0} · Zdobyte: {result?.frame ?? 0} FRAME</p>{result?.reason && <p>{result.reason}</p>}</>}</div>}</div>
 {phase !== 'playing' && <p className="run-start-note">Gra o FRAME: minimum 15 s. Wyjście z gry lub ukrycie aplikacji przerywa trwającą rundę bez nagrody.</p>}
 {phase !== 'playing' && phase !== 'verifying' && phase !== 'loading' && <div className="run-actions"><Button onClick={() => void start('practice')}>{phase === 'result' ? 'Zagraj ponownie: trening' : 'Trening bez limitu'}</Button><Button className="primary" disabled={!status?.configured || status.remaining <= 0 || !!status?.pending || result?.state === 'pending'} onClick={() => void start('reward')}>Graj o FRAME</Button>{(status?.pending || result?.state === 'pending') && <><Button onClick={() => void retry()}>Ponów weryfikację wyniku</Button><Button onClick={() => void api?.frameRun({ action: 'cancel' }).then(() => { setResult(null); setPhase('start'); void refresh(); }).catch(e => setError(e.message))}>Porzuć oczekującą rundę</Button></>}</div>}
 {phase === 'playing' && <Button onClick={() => { abandon(); setResult({ state: 'rejected', frame: 0, reason: 'Przerwano rundę.' }); setPhase('result'); }}>Zakończ bez punktów</Button>}
 <div className="panel run-info"><strong>Saldo FRAME: {status?.configured ? status.balance : 'serwer nieskonfigurowany'}</strong><p>Pozostały limit: {status?.configured ? status.remaining : 'brak konta'} / 30 FRAME. Reset: 00:00 UTC{status?.resetAt ? ' (' + new Date(status.resetAt).toLocaleString('pl-PL') + ')' : ''}.</p><p>Minimum 15 sekund. 1 FRAME za każde pełne 10 sekund, do 9 za rundę. Wyjście z ekranu, ukrycie aplikacji lub zmiana portfela/sieci kończy rundę nagradzaną bez punktów. Trening nie nalicza FRAME.</p></div>
 {api && phase !== 'playing' && <details><summary>Konto serwera FRAME Run</summary><p>PIN odblokowuje portfel lokalnie. Konto punktowe wymaga osobnego tokenu wydanego przez operatora serwera. Ten sam token oznacza to samo konto na wszystkich sieciach i portfelach.</p><Field label="Adres serwera"><input value={url} onChange={e => setUrl(e.target.value)}/></Field><Field label="Token konta serwera"><input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)}/></Field><Button disabled={!!status?.pending} onClick={() => void api.frameRun({ action: 'configure', credentials: { url, token } }).then(s => { if (mounted.current) {
        setToken('');
        setStatus({ ...s, configured: true });
        setError('');
    } }).catch(e => setError(e.message))}>Połącz konto</Button></details>}
 </section>;
}
