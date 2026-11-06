import {useEffect,useState} from 'react';
import {Button} from '../ui';
import {tr} from '../../lib/i18n';
export function loadGame<T>(key:string,fallback:T):T{try{const text=localStorage.getItem(key);if(text&&text.length<100000)return JSON.parse(text);}catch{}return fallback;}
export function saveGame(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
export function usePaused(){const [paused,setPaused]=useState(false);useEffect(()=>{const blur=()=>setPaused(true);const visibility=()=>{if(document.hidden)blur();};window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);return()=>{window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);};},[]);return [paused,setPaused] as const;}
export function Controls({paused,onPause,onRestart}:{paused:boolean;onPause:()=>void;onRestart:()=>void}){return <div className="game-toolbar"><Button onClick={onPause}>{paused?tr('Wznów'):tr('Pauza')}</Button><Button onClick={onRestart}>{tr('Rozpocznij od nowa')}</Button></div>;}
export function beep(muted:boolean,frequency=500){if(muted||document.hidden)return;try{const context=new AudioContext(),o=context.createOscillator(),g=context.createGain();o.frequency.value=frequency;g.gain.setValueAtTime(.035,context.currentTime);g.gain.exponentialRampToValueAtTime(.001,context.currentTime+.08);o.connect(g).connect(context.destination);o.start();o.stop(context.currentTime+.08);o.onended=()=>void context.close();}catch{}}
