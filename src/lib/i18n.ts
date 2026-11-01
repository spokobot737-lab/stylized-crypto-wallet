import {translate,type Language} from '../../shared/i18n';
let language:Language='pl';
try{if(typeof localStorage!=='undefined'&&JSON.parse(localStorage.getItem('frame:preferences')||'{}').language==='en')language='en';}catch{}
export function setLanguage(next:Language){language=next;}
export function tr(text:string,...args:unknown[]){return translate(text,language,...args);}
export function locale(){return language==='en'?'en-GB':'pl-PL';}
