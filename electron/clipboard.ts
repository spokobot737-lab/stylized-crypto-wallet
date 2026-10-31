export interface SystemClipboard {writeText(text:string):Promise<void>|void;readText():Promise<string>|string;}
export function isPublicClipboardText(text:unknown):text is string {
 if(typeof text!=='string'||text.length>128)return false;
 return /^(0x)?[a-fA-F0-9]{64}$/.test(text)||/^0x[a-fA-F0-9]{40}$/.test(text)||/^(bc1|tb1)[ac-hj-np-z02-9]{11,87}$/.test(text)||/^[1-9A-HJ-NP-Za-km-z]{26,100}$/.test(text);
}
let queue:Promise<unknown>=Promise.resolve();
export async function copyPublicText(text:unknown,clipboard:SystemClipboard){
 if(!isPublicClipboardText(text))throw new Error('Można kopiować tylko publiczny adres lub identyfikator transakcji.');
 const operation=queue.then(async()=>{await clipboard.writeText(text);if(await clipboard.readText()!==text)throw new Error('System nie zapisał treści w schowku. Spróbuj ponownie.');});queue=operation.catch(()=>{});await operation;
}
