import { _electron as electron } from 'playwright';
import { mkdtemp,rm,mkdir,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createVault } from '../electron/vault.ts';
const directory=await mkdtemp(join(tmpdir(),'frame-smoke-'));
const pin='735291',newPin='946283',password='Legacy-test-password-123!';
const mnemonic='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
let application;const errors=[];
async function launch(){application=await electron.launch({args:['.'],env:{...process.env,FRAME_TEST_DIR:directory,WALLET_DEV:'0'},timeout:45000});const page=await application.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));return page;}
async function profile(page){await page.getByRole('button',{name:'Profil i ustawienia',exact:true}).click();}
async function contrast(page,label){
 const issues=await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const rgba=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((n,i)=>i===3?n/255:n);};
  const blend=(top,bottom)=>[0,1,2].map(i=>top[i]*top[3]+bottom[i]*(1-top[3]));
  const lum=rgb=>{const x=rgb.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return .2126*x[0]+.7152*x[1]+.0722*x[2];};
  const selectors=['.asset-balance','.asset-address','.asset-footer button','.profile-avatar','.profile-dropdown>button','.sidebar nav button.active','.wallet-selector select','.wallet-heading .eyebrow','.topbar .tag','.muted','.field>span','.field>small','.note','button.primary'];
  const issues=[];
  for(const selector of selectors)for(const el of document.querySelectorAll(selector)){
   const style=getComputedStyle(el);if(!el.getClientRects().length||style.visibility==='hidden'||el.disabled)continue;
   const ancestors=[];let opacity=1;for(let node=el;node;node=node.parentElement){ancestors.unshift(node);opacity*=Number(getComputedStyle(node).opacity);}
   let bg=[16,17,22];for(const node of ancestors)bg=blend(rgba(getComputedStyle(node).backgroundColor),bg);
   const fg=rgba(style.color);fg[3]*=opacity;const actual=blend(fg,bg),l1=lum(actual),l2=lum(bg),ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
   const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700);const threshold=large?3:4.5;
   if(ratio<threshold)issues.push({selector,ratio:Number(ratio.toFixed(2)),text:(el.textContent||'').trim().slice(0,45)});
  }
  return issues;
 });assert.deepEqual(issues,[],`Contrast regression (${label}): ${JSON.stringify(issues)}`);
}
try{
 // Upgrade an actual v0.1-format test vault; no user wallet or secret is involved.
 await createVault(join(directory,'wallet.vault'),{mnemonic,passphrase:''},password);const legacyBytes=await readFile(join(directory,'wallet.vault'));
 let page=await launch();await page.getByRole('heading',{name:'Jeden PIN dla aplikacji'}).waitFor();
 await page.getByLabel('Dotychczasowe hasło portfela').fill(password);await page.getByLabel('Nowy PIN aplikacji').fill(pin);await page.getByLabel('Powtórz PIN',{exact:true}).fill(pin);await page.getByRole('button',{name:'Zapisz PIN i otwórz aplikację'}).click();await page.getByRole('heading',{name:'Portfel 1',exact:true}).waitFor({timeout:30000});
 assert.deepEqual(await readFile(join(directory,'wallet.vault')),legacyBytes);let state=await page.evaluate(()=>window.wallet.status('testnet'));const originalId=state.activeWalletId,originalAddress=state.accounts[1].address;
 const isolation=await page.evaluate(()=>({node:typeof window.require,process:typeof window.process}));assert.equal(isolation.node,'undefined');assert.equal(isolation.process,'undefined');
 // Add/import another wallet entirely through the UI, without another password/PIN prompt.
 await page.getByRole('button',{name:'Dodaj portfel',exact:true}).click();await page.getByRole('button',{name:/Importuj istniejący/}).click();await page.getByLabel('Nazwa portfela',{exact:true}).fill('Drugi portfel');await page.getByLabel('Fraza seed (12, 15, 18, 21 lub 24 słowa)').fill(mnemonic);await page.getByText('Opcjonalna passphrase BIP39',{exact:true}).click();await page.getByLabel('Passphrase BIP39',{exact:false}).fill('second-public-test-wallet');await page.getByRole('checkbox').check();await page.getByRole('dialog').getByRole('button',{name:'Dodaj portfel',exact:true}).click();await page.getByRole('heading',{name:'Drugi portfel',exact:true}).waitFor();
 state=await page.evaluate(()=>window.wallet.status('testnet'));assert.equal(state.wallets.length,2);assert.notEqual(state.accounts[1].address,originalAddress);const secondId=state.activeWalletId;
 await page.getByRole('combobox',{name:'Aktywny portfel'}).selectOption(originalId);await page.getByRole('heading',{name:'Portfel 1',exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.wallet.status('testnet'))).accounts[1].address,originalAddress);
 await page.getByRole('button',{name:'Zmień układ',exact:true}).click();await page.getByRole('button',{name:'Przesuń BTC w lewo',exact:true}).click();await page.getByRole('button',{name:'Przesuń BTC w lewo',exact:true}).click();await page.getByRole('button',{name:'Zmniejsz kafelek BTC',exact:true}).click();assert.equal(await page.getByTestId('asset-BTC').getAttribute('data-size'),'small');assert.equal(await page.locator('.asset-card').first().getAttribute('data-testid'),'asset-BTC');await page.getByRole('button',{name:'Zakończ edycję',exact:true}).click();
 assert.equal(await page.getByText('FAST. FLUID. YOURS.',{exact:true}).count(),0);assert.equal(await page.getByText('100% Twoje.',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Personalizacja',exact:true}).click();await page.getByRole('button',{name:/ALIEN SIGNAL/}).click();
 await mkdir('docs',{recursive:true});
 for(const accent of ['violet','cyan','lime','pink']){await page.getByRole('button',{name:`Akcent ${accent}`,exact:true}).click();await page.getByRole('button',{name:'Twój portfel',exact:true}).click();await profile(page);await contrast(page,accent);await page.getByRole('button',{name:'O aplikacji i bezpieczeństwie',exact:true}).click();await page.getByRole('dialog',{name:'O FRAME Wallet'}).waitFor();await contrast(page,`${accent} dialog`);await page.getByRole('button',{name:'Zamknij informacje',exact:true}).click();await page.getByRole('button',{name:'Personalizacja',exact:true}).click();}
 await page.getByRole('button',{name:'Akcent violet',exact:true}).click();await page.getByRole('button',{name:'Twój portfel',exact:true}).click();await page.screenshot({path:'docs/alien-signal.png',fullPage:true});
 await profile(page);await page.getByRole('button',{name:'Portfele',exact:true}).click();await page.getByRole('dialog',{name:'Twoje portfele'}).waitFor();await page.getByRole('button',{name:'Zamknij',exact:true}).click();
 await page.getByRole('button',{name:'Personalizacja',exact:true}).click();await page.getByRole('button',{name:/POP CONTROL/}).click();await page.getByRole('button',{name:'Twój portfel',exact:true}).click();await page.screenshot({path:'docs/pop-control.png',fullPage:true});
 await page.getByRole('button',{name:'Odbierz SOL',exact:true}).click();await page.getByRole('img',{name:'Kod QR adresu SOL'}).waitFor();await page.getByRole('button',{name:'Zamknij',exact:true}).click();await page.getByRole('button',{name:'Wyślij ETH',exact:true}).click();assert.equal(await page.getByRole('dialog').locator('input[type="password"]').count(),0);await page.getByRole('textbox',{name:'Adres odbiorcy'}).fill('invalid-address');await page.getByRole('textbox',{name:'Kwota (ETH)'}).fill('0.001');await page.getByRole('button',{name:'Dalej: podgląd opłaty'}).click();await page.getByRole('alert').filter({hasText:'Nieprawidłowy adres Ethereum.'}).waitFor();await page.getByRole('button',{name:'Zamknij',exact:true}).click();
 await profile(page);await page.getByRole('button',{name:'Zmień PIN aplikacji',exact:true}).click();await page.getByLabel('Obecny PIN',{exact:true}).fill(pin);await page.getByLabel('Nowy PIN',{exact:true}).fill(newPin);await page.getByLabel('Powtórz nowy PIN',{exact:true}).fill(newPin);await page.getByRole('button',{name:'Zapisz PIN',exact:true}).click();await page.getByText('PIN został zmieniony dla wszystkich portfeli.',{exact:true}).waitFor();await page.getByRole('button',{name:'Gotowe',exact:true}).click();
 await page.getByRole('combobox',{name:'Aktywny portfel'}).selectOption(secondId);await page.getByRole('heading',{name:'Drugi portfel',exact:true}).waitFor();await page.getByRole('button',{name:'Zablokuj',exact:true}).click();await page.getByRole('heading',{name:'Odblokuj FRAME'}).waitFor();assert.equal(await page.getByRole('button',{name:'Personalizacja',exact:true}).count(),0);assert.equal((await page.evaluate(()=>window.wallet.status('testnet'))).unlocked,false);
 // Restart proves the OS-protected device key and active wallet survive process termination.
 await application.close();application=undefined;page=await launch();await page.getByRole('heading',{name:'Odblokuj FRAME'}).waitFor();await page.getByLabel('PIN aplikacji',{exact:true}).fill(newPin);await page.getByRole('button',{name:'Odblokuj aplikację'}).click();await page.getByRole('heading',{name:'Drugi portfel',exact:true}).waitFor();state=await page.evaluate(()=>window.wallet.status('testnet'));assert.equal(state.wallets.length,2);assert.equal(state.activeWalletId,secondId);assert.equal(await page.getByTestId('asset-BTC').getAttribute('data-size'),'small');assert.equal(await page.locator('.asset-card').first().getAttribute('data-testid'),'asset-BTC');assert.deepEqual(errors,[]);
 console.log('Windows smoke passed: legacy migration, shared PIN, multiple wallets, switch/restart, profile menu, reorder/resize persistence, four Alien contrast variants, QR, validation, lock.');
}finally{await application?.close();await rm(directory,{recursive:true,force:true});}
