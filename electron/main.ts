import { app, BrowserWindow, ipcMain, session, dialog, shell, protocol, powerMonitor, safeStorage, clipboard } from 'electron';
import { join, resolve, sep, extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { WalletService, networkSchema } from './service';
import { explorer } from './chains';
import { translate } from '../shared/i18n';
import { copyPublicText } from './clipboard';
app.setName('FRAME Wallet');
// Test profiles must be selected before Chromium creates any session storage.
if(!app.isPackaged&&process.env.FRAME_TEST_DIR){app.setPath('userData',process.env.FRAME_TEST_DIR);app.setPath('sessionData',process.env.FRAME_TEST_DIR);}
if(process.platform==='win32')app.setAppUserModelId('app.frame.wallet');
protocol.registerSchemesAsPrivileged([{scheme:'frame',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const dev=!app.isPackaged&&process.env.WALLET_DEV==='1';
let window:BrowserWindow;let wallet:WalletService;let lastActivity=Date.now();
const rendererUrl=dev?'http://127.0.0.1:5173/':'frame://app/index.html';
function trusted(event:Electron.IpcMainInvokeEvent){
 if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('Niedozwolone źródło IPC.');
 const url=event.senderFrame.url;if(dev?!url.startsWith('http://127.0.0.1:5173/'):!url.startsWith('frame://app/'))throw new Error('Niedozwolony dokument.');
}
function handle(name:string,fn:(...args:any[])=>unknown){ipcMain.handle(`wallet:${name}`,async(event,...args)=>{
 trusted(event);if(Date.now()-lastActivity>5*60_000)lock();if(['unlock','initialize','migrate','create','import','switchWallet','renameWallet','changePin','send','quote','reveal','copyText','assetQuote','assetSend','saveIntegrations','uploadMetadata','configure'].includes(name))lastActivity=Date.now();
 try{return {ok:true,value:await fn(...args)};}catch(error){const message=error instanceof z.ZodError?'Nieprawidłowe dane wejściowe.':error instanceof Error?error.message:'Operacja nie powiodła się.';return {ok:false,error:message.replace(/https?:\/\/\S+/g,'[adres usługi]')};}
});}
function lock(){wallet.lock();window?.webContents.send('wallet:locked');}
if(!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(()=>{
 protocol.handle('frame',async request=>{
  const url=new URL(request.url);if(url.hostname!=='app')return new Response('Forbidden',{status:403});
  const root=resolve(__dirname,'../dist');const file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+sep))return new Response('Forbidden',{status:403});
  const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
  if(!mime[extname(file)])return new Response('Forbidden',{status:403});
  try{return new Response(await readFile(file),{headers:{'Content-Type':mime[extname(file)],'X-Content-Type-Options':'nosniff'}});}catch{return new Response('Not found',{status:404});}
 });
 const protector={
  async seal(text:string){if(!await safeStorage.isAsyncEncryptionAvailable()||(process.platform==='linux'&&safeStorage.getSelectedStorageBackend()==='basic_text'))throw new Error('Systemowy magazyn kluczy jest niedostępny. PIN wymaga ochrony systemowej.');return safeStorage.encryptStringAsync(text);},
  async open(bytes:Buffer){if(!await safeStorage.isAsyncEncryptionAvailable()||(process.platform==='linux'&&safeStorage.getSelectedStorageBackend()==='basic_text'))throw new Error('Systemowy magazyn kluczy jest niedostępny.');return (await safeStorage.decryptStringAsync(bytes)).result;}
 };
 wallet=new WalletService(app.getPath('userData'),protector);
 const t=(value:string)=>translate(value,wallet.integrations.language);
 session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 session.defaultSession.setPermissionCheckHandler(()=>false);
 // Renderer never talks to RPC or loads remote scripts. Network access lives in the main process.
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{
  const u=details.url;callback({cancel:!(u.startsWith('frame://app/')||(dev&&(u.startsWith('http://127.0.0.1:5173/')||u.startsWith('ws://127.0.0.1:5173/'))))});
 });
 window=new BrowserWindow({width:1440,height:960,minWidth:1000,minHeight:720,backgroundColor:'#101116',icon:join(__dirname,'../dist/app-icon.png'),title:'FRAME Wallet',autoHideMenuBar:true,webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:dev,spellcheck:false}});
 window.setMenu(null);window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',(event,url)=>{if(url!==rendererUrl)event.preventDefault();});
 window.webContents.on('will-attach-webview',event=>event.preventDefault());
 window.webContents.on('before-input-event',()=>{lastActivity=Date.now();});
 powerMonitor.on('lock-screen',lock);powerMonitor.on('suspend',lock);window.on('closed',()=>wallet.lock());
 handle('integrations',()=>wallet.integrationStatus());handle('saveIntegrations',input=>wallet.saveIntegrations(input));handle('configure',input=>wallet.configure(input));
 handle('nfts',input=>wallet.nfts(input));handle('nftImage',uri=>wallet.nftImage(uri));handle('uploadMetadata',input=>wallet.uploadMetadata(input));handle('usdc',network=>wallet.usdc(network));handle('assetQuote',input=>wallet.assetQuote(input));handle('assetOperations',()=>wallet.assetOperations());
 handle('assetSend',id=>wallet.assetSend(id,async quote=>{const result=await dialog.showMessageBox(window,{type:'warning',title:t('FRAME · Potwierdź operację'),message:t(quote.title),detail:[t(`Sieć: ${quote.chain} ${quote.network}`),t(`Nadawca: ${quote.from}`),...quote.details.map(t),`${t(quote.feeLabel)}: ${quote.fee}`,t(`Liczba transakcji: ${quote.transactions}`),t('Operacja jest nieodwracalna.')].join('\n'),buttons:[t('Anuluj'),t('Podpisz i wykonaj')],defaultId:0,cancelId:0,noLink:true});return result.response===1;}));
 handle('status',network=>wallet.status(networkSchema.parse(network)));handle('generate',()=>wallet.generate());
 handle('initialize',pin=>wallet.initialize(pin));handle('migrate',input=>wallet.migrate(input));
 handle('switchWallet',(id,network)=>wallet.switchWallet(id,network));handle('renameWallet',(id,name,network)=>wallet.renameWallet(id,name,network));handle('changePin',(oldPin,newPin)=>wallet.changePin(oldPin,newPin));
 handle('create',input=>wallet.create(input));handle('import',input=>wallet.import(input));
 handle('unlock',(password,network)=>wallet.unlock(z.string().max(256).parse(password),network));handle('lock',lock);
 handle('copyText',value=>{if(!wallet.status('testnet').unlocked)throw new Error('Aplikacja jest zablokowana.');return copyPublicText(value,clipboard);});
 handle('activity',input=>wallet.activity(input));
 handle('balances',network=>wallet.balances(network));handle('quote',input=>{if(input?.network!==wallet.integrations.network)throw new Error('Zmieniono środowisko sieciowe. Przygotuj operację ponownie.');return wallet.quote(input);});
 handle('history',()=>wallet.history());handle('reveal',password=>wallet.reveal(z.string().max(256).parse(password)));
 handle('send',id=>wallet.send(id,async quote=>{
  // An OS-owned confirmation shows the immutable, main-process quote, outside React.
  const result=await dialog.showMessageBox(window,{type:'warning',title:t('FRAME · Potwierdź przelew'),message:translate('Wyślij {0}',wallet.integrations.language,`${quote.amount} ${quote.chain}?`),detail:[t(`Sieć: ${quote.networkLabel}`),t(`Odbiorca: ${quote.to}`),`${t('Opłata')}: ${quote.fee} ${quote.chain}`,'',t('Przelewu nie można cofnąć.')].join('\n'),buttons:[t('Anuluj'),t('Podpisz i wyślij')],defaultId:0,cancelId:0,noLink:true});return result.response===1;
 }));
 handle('openExplorer',transfer=>{
  const data=z.object({chain:z.enum(['SOL','ETH','BTC']),network:networkSchema,hash:z.string().max(128)}).passthrough().parse(transfer);
  return shell.openExternal(explorer(data.chain,data.network,data.hash));
 });
 setInterval(()=>{if(Date.now()-lastActivity>5*60_000&&wallet.status('testnet').unlocked)lock();},10000).unref();
 app.on('browser-window-focus',()=>{if(Date.now()-lastActivity>5*60_000)lock();});
 app.on('second-instance',()=>{if(window){window.restore();window.focus();}});
 void window.loadURL(rendererUrl);
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>wallet?.lock());
