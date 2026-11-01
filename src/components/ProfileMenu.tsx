import { tr } from '../lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { KeyRound, Settings2, WalletCards, Fingerprint, Info, LockKeyhole } from 'lucide-react';
export default function ProfileMenu({ name, onWallets, onSettings, onBackup, onPin, onAbout, onLock }: {
    name: string;
    onWallets: () => void;
    onSettings: () => void;
    onBackup: () => void;
    onPin: () => void;
    onAbout: () => void;
    onLock: () => void;
}) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    useEffect(() => { if (!open)
        return; function outside(e: PointerEvent) { if (!root.current?.contains(e.target as Node))
        setOpen(false); } function key(e: KeyboardEvent) { if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
    } } document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key); return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); }; }, [open]);
    const items = [{ text: tr("Portfele"), icon: WalletCards, fn: onWallets }, { text: tr("Ustawienia"), icon: Settings2, fn: onSettings }, { text: tr("Kopia zapasowa"), icon: KeyRound, fn: onBackup }, { text: tr("Zmie\u0144 PIN aplikacji"), icon: Fingerprint, fn: onPin }, { text: tr("O aplikacji i bezpiecze\u0144stwie"), icon: Info, fn: onAbout }, { text: tr("Zablokuj aplikacj\u0119"), icon: LockKeyhole, fn: onLock }];
    return <div className="profile-menu-root" ref={root}><button ref={button} className="profile-avatar" aria-label={tr("Profil i ustawienia")} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>{(name || 'F').slice(0, 1).toUpperCase()}</button>{open && <div className="profile-dropdown panel" aria-label={tr("Ustawienia profilu")}><div className="profile-dropdown-title">{name || 'FRAME'}</div>{items.map(({ text, icon: Icon, fn }) => <button key={text} onClick={() => { setOpen(false); fn(); }}><Icon size={17}/>{text}</button>)}</div>}</div>;
}
