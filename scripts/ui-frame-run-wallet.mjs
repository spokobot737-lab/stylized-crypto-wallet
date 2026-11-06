// Integration test of the actual compiled wallet entry, preload, IPC and frame:// renderer.
import {_electron as electron} from 'playwright';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'frame-run-wallet-'));
let app;
try{
 app=await electron.launch({args:[process.platform==='linux'?'tests/support/frame-run-wallet-main.cjs':'.',...(process.platform==='linux'?['--no-sandbox','--ozone-platform=headless','--ozone-override-screen-size=1440,1080','--disable-dev-shm-usage','--disable-gpu']:[])],env:{...process.env,FRAME_TEST_DIR:directory,WALLET_DEV:'0'},timeout:60000});
  const page=await app.firstWindow({timeout:30000});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.ok(page.url().startsWith('frame://app/'),'production application protocol, not the browser preview');
 assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
 assert.equal(await page.evaluate(()=>typeof window.wallet.frameRun),'function');
 if(process.platform!=='win32'){
  // Test process only. Linux CI has no desktop keyring; production never uses this protector.
  await app.evaluate(({safeStorage})=>{
   safeStorage.isAsyncEncryptionAvailable=async()=>true;safeStorage.getSelectedStorageBackend=()=> 'test-only';
   safeStorage.encryptStringAsync=async s=>Buffer.from(s);safeStorage.decryptStringAsync=async b=>({result:b.toString()});
  });
 }
 // Only unrelated network panels are stubbed; game, wallet initialization, lock and their IPC are real.
 await app.evaluate(({ipcMain})=>{
  for(const [name,value] of [['balances',[]],['usdc',[]],['activity',{items:[],next:{},warnings:[],fetchedAt:Date.now()}]]){
   ipcMain.removeHandler('wallet:'+name);ipcMain.handle('wallet:'+name,()=>({ok:true,value}));
  }
 });
 await page.evaluate(async()=>{
  await window.wallet.initialize('735291');
  await window.wallet.import({name:'Portfel testowy',mnemonic:'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',passphrase:''});
 });
 await page.reload();await page.getByRole('button',{name:'Gry',exact:true}).click();await page.getByRole('button').filter({hasText:'Skacz, kucaj i pobij rekord.'}).click();await page.locator('.legacy-run summary').click();
 assert.equal(await page.locator('.preview-banner').count(),0);
 assert.deepEqual(await page.evaluate(()=>window.wallet.frameRun({action:'status'})),{configured:false});
 await page.locator('.frame-run').getByRole('heading',{name:'FRAME Run',exact:true}).waitFor();
 await page.getByRole('button',{name:'Trening bez limitu'}).click();
 await page.locator('.run-stage canvas').press('Space');
 await page.getByRole('heading',{name:'Wynik treningu'}).waitFor({timeout:15000});
 assert.match(await page.locator('.run-overlay').innerText(),/Zdobyte: 0 FRAME/);
 await mkdir('docs',{recursive:true});await page.screenshot({path:'docs/frame-run-wallet.png',fullPage:true});
 await page.getByRole('button',{name:'Twój portfel',exact:true}).click();await page.getByRole('heading',{name:'Portfel testowy',exact:true}).waitFor();
 await page.getByRole('button',{name:'Gry',exact:true}).click();await page.getByRole('button').filter({hasText:'Skacz, kucaj i pobij rekord.'}).click();await page.locator('.legacy-run summary').click();await page.getByRole('button',{name:'Trening bez limitu'}).click();
 await page.getByRole('button',{name:'Zablokuj',exact:true}).click();await page.getByRole('heading',{name:'Odblokuj FRAME'}).waitFor();
 assert.equal(await page.locator('.frame-run').count(),0);assert.deepEqual(errors,[]);
 console.log('FRAME Run inside real Frame Wallet: frame://, production preload/IPC, unlocked wallet, training, return to wallet and lock passed.');
}finally{await app?.close();await rm(directory,{recursive:true,force:true});}
