import { _electron as electron } from 'playwright';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'frame-smoke-'));
const password='Public-test-password-123!';
const mnemonic='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
let application;
try {
 application=await electron.launch({args:['.'],env:{...process.env,FRAME_TEST_DIR:directory,WALLET_DEV:'0'},timeout:45000});
 const page=await application.firstWindow();page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('heading',{name:'Zacznij po swojemu.'}).waitFor();
 await page.getByRole('button',{name:/Mam już portfel/}).click();
 await page.getByLabel('Fraza seed (12, 15, 18, 21 lub 24 słowa)').fill(mnemonic);
 await page.getByLabel('Hasło lokalnego sejfu').fill(password);
 await page.getByLabel('Powtórz hasło',{exact:true}).fill(password);
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Otwórz mój FRAME'}).click();
 await page.getByRole('heading',{name:'Wszystko w Twojej ramie.'}).waitFor({timeout:30000});
 const status=await page.evaluate(()=>window.wallet.status('testnet'));
 assert.equal(status.accounts.length,3);assert.equal(status.unlocked,true);
 const root=await page.evaluate(()=>({node:typeof window.require,process:typeof window.process}));assert.equal(root.node,'undefined');assert.equal(root.process,'undefined');
 await page.getByRole('button',{name:'Personalizacja',exact:true}).click();
 await page.getByRole('button',{name:/ALIEN SIGNAL/}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'alien');
 await page.getByRole('button',{name:'Akcent cyan',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-accent'),'cyan');
 await page.getByRole('button',{name:'Twój portfel',exact:true}).click();
 await mkdir('docs',{recursive:true});
 // Screenshot only public fixed fixture addresses; never capture an actual user's seed or wallet.
 await page.screenshot({path:'docs/alien-signal.png',fullPage:true});
 await page.getByRole('button',{name:'Personalizacja',exact:true}).click();await page.getByRole('button',{name:/POP CONTROL/}).click();
 await page.getByRole('button',{name:'Twój portfel',exact:true}).click();await page.screenshot({path:'docs/pop-control.png',fullPage:true});
 await page.getByRole('button',{name:'Odbierz SOL',exact:true}).click();await page.getByRole('dialog',{name:'Odbierz środki'}).waitFor();
 await page.getByRole('img',{name:'Kod QR adresu SOL'}).waitFor();await page.getByRole('button',{name:'Zamknij',exact:true}).click();
 await page.getByRole('button',{name:'Wyślij ETH',exact:true}).click();await page.getByRole('textbox',{name:'Adres odbiorcy'}).fill('invalid-address');await page.getByRole('textbox',{name:'Kwota (ETH)'}).fill('0.001');await page.getByRole('button',{name:'Dalej: podgląd opłaty'}).click();await page.getByRole('alert').filter({hasText:'Nieprawidłowy adres Ethereum.'}).waitFor();await page.getByRole('button',{name:'Zamknij',exact:true}).click();
 await page.getByRole('button',{name:'Zablokuj',exact:true}).click();await page.getByRole('heading',{name:'Witaj z powrotem.'}).waitFor();
 assert.equal((await page.evaluate(()=>window.wallet.status('testnet'))).unlocked,false);
 assert.deepEqual(errors,[]);console.log('Electron smoke passed: import, isolation, themes, QR, invalid recipient, lock.');
} finally {await application?.close();await rm(directory,{recursive:true,force:true});}
