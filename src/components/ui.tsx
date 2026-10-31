import { X, ArrowUpRight, Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
export function Button({children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>){return <button className={`button ${className}`} {...props}>{children}</button>;}
export function Tag({children,tone=''}:{children:ReactNode;tone?:string}){return <span className={`tag ${tone}`}>{children}</span>;}
export function SectionHead({eyebrow,title,action}:{eyebrow:string;title:string;action?:ReactNode}){return <div className="section-head"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>{action}</div>;}
export function CopyButton({value,label='Kopiuj adres'}:{value:string;label?:string}){const [copied,setCopied]=useState(false),[error,setError]=useState('');const reset=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);useEffect(()=>()=>clearTimeout(reset.current),[]);
 return <span className="copy-control"><button type="button" className="icon-button" aria-label={label} title={copied?'Skopiowano do schowka':label} onClick={async()=>{setError('');try{if(!window.wallet)throw new Error('Schowek jest dostępny w aplikacji desktopowej.');await window.wallet.copyText(value);setCopied(true);clearTimeout(reset.current);reset.current=setTimeout(()=>setCopied(false),2200);}catch(e){setCopied(false);setError((e as Error).message);}}}>{copied?<Check size={17}/>:<Copy size={17}/>}</button><span className="sr-only" role="status">{copied?'Skopiowano do schowka':error}</span>{error&&<span className="copy-error" role="alert">{error}</span>}</span>;
}

export function Modal({title,eyebrow,children,onClose}:{title:string;eyebrow:string;children:ReactNode;onClose:()=>void}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement;ref.current?.focus();function keyboard(e:KeyboardEvent){if(e.key==='Escape')onClose();if(e.key==='Tab'){const items=ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,[tabindex="0"]');if(!items?.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}document.addEventListener('keydown',keyboard);return()=>{document.removeEventListener('keydown',keyboard);previous?.focus();};},[onClose]);
 return <div className="modal-backdrop"><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="modal panel"><div className="modal-head"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div><button className="icon-button" aria-label="Zamknij" onClick={onClose}><X/></button></div>{children}</div></div>;
}
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function ErrorMessage({error}:{error:string}){return error?<div className="error" role="alert">{error}</div>:null;}
export function Star({className=''}:{className?:string}){return <svg className={className} viewBox="0 0 100 100" aria-hidden="true"><path d="M50 0 60 29 85 15 71 40 100 50 71 60 85 85 60 71 50 100 40 71 15 85 29 60 0 50 29 40 15 15 40 29Z" fill="currentColor"/></svg>;}
export function ArrowLink(){return <ArrowUpRight size={18}/>;}
