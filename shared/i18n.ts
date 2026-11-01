import dictionary from './en.json';
export type Language='pl'|'en';
const en:Record<string,string>=dictionary;
const patterns=Object.entries(en).filter(([key])=>/\{\d+\}/.test(key)).map(([key,value])=>{
 const source=key.split(/\{\d+\}/).map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('(.+?)');
 return {key,value,regex:new RegExp('^'+source+'$')};
});
export function translate(text:string,language:Language,...args:unknown[]):string{
 if(typeof text!=='string')return String(text??'');
 let translated=text;
 if(language==='en'){
  const trimmed=text.trim();
  if(en[trimmed])translated=text.replace(trimmed,en[trimmed]);
  else{for(const pattern of patterns){const matches=pattern.regex.exec(trimmed);if(matches){translated=pattern.value.replace(/\{(\d+)\}/g,(_,index)=>matches[Number(index)+1]||'');break;}}}
 }
 return translated.replace(/\{(\d+)\}/g,(original,index)=>args[Number(index)]===undefined?original:String(args[Number(index)]));
}
