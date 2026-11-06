import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('tests/.generated',{recursive:true});
const app=await electron.launch({args:['tests/support/frame-run-main.cjs',...(process.platform==='linux'?['--no-sandbox','--ozone-platform=headless','--ozone-override-screen-size=1440,1080','--disable-dev-shm-usage']:[])],timeout:60000});
const errors=[];
try{
 const page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'Gry',exact:true}).click();await page.getByRole('button').filter({hasText:'Skacz, kucaj i pobij rekord.'}).click();await page.locator('.legacy-run summary').click();
 await page.locator('.frame-run').getByRole('heading',{name:'FRAME Run',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Graj o FRAME'}).isDisabled(),true);
 await page.locator('.frame-run').getByRole('button',{name:'Dźwięk wyłączony',exact:true}).click();
 await page.locator('.frame-run').getByRole('button',{name:'Dźwięk włączony',exact:true}).click();
 await page.getByRole('button',{name:'Trening bez limitu'}).click();
 const canvas=page.locator('.run-stage canvas');
 await canvas.focus();await canvas.press('Space');await page.waitForTimeout(200);
 // The player outline moves above its resting y=249 when input reaches the simulator.
 const airborne=()=>page.locator('.run-stage canvas').evaluate(c=>{const ctx=c.getContext('2d');const {a,d}=ctx.getTransform();let count=0;for(let y=Math.floor(80*d);y<220*d;y++)for(let x=Math.floor(115*a);x<158*a;x++){const p=ctx.getImageData(x,y,1,1).data;if(p[0]>150&&p[1]>140&&p[2]>200)count++;}return count>10;});
 assert.equal(await airborne(),true,'space triggers a visible jump');
 await page.waitForTimeout(800);await canvas.click({position:{x:100,y:100}});await page.waitForTimeout(200);assert.equal(await airborne(),true,'click triggers jump');
 await page.getByRole('button',{name:'Zakończ bez punktów'}).click();await page.getByRole('heading',{name:'Runda odrzucona'}).waitFor();
 await page.getByRole('button',{name:'Zagraj ponownie: trening'}).click();
 await page.getByRole('heading',{name:'Wynik treningu'}).waitFor({timeout:10000});
 assert.match(await page.locator('.run-overlay').innerText(),/Zdobyte: 0 FRAME/);
 await page.screenshot({path:'docs/frame-run-desktop.png',fullPage:true});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(420,820));
 await page.getByRole('button',{name:'Zagraj ponownie: trening'}).click();
 await canvas.dispatchEvent('pointerdown',{pointerType:'touch',isPrimary:true});await page.waitForTimeout(200);assert.equal(await airborne(),true,'touch pointer triggers jump');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile layout has no horizontal overflow');
 await page.screenshot({path:'docs/frame-run-mobile.png',fullPage:true});
 await page.locator('.sidebar nav button').first().click();await page.getByRole('button',{name:'Gry',exact:true}).click();await page.getByRole('button').filter({hasText:'Skacz, kucaj i pobij rekord.'}).click();await page.locator('.legacy-run summary').click();
 await page.getByRole('button',{name:'Trening bez limitu'}).waitFor();
 await page.reload();await page.getByRole('button',{name:'Gry',exact:true}).click();await page.getByRole('button').filter({hasText:'Skacz, kucaj i pobij rekord.'}).click();await page.locator('.legacy-run summary').click();await page.locator('.frame-run').getByRole('button',{name:'Dźwięk wyłączony',exact:true}).waitFor();assert.equal(await page.locator('.frame-run').getByRole('button',{name:'Dźwięk wyłączony',exact:true}).count(),1);
 assert.ok(await page.evaluate(()=>Number(localStorage.getItem('frame:run:best'))>0),'training best persists');
 assert.equal(await page.evaluate(()=>localStorage.getItem('frame:run:balance')),null);
 assert.deepEqual(errors,[]);console.log('FRAME Run UI: desktop/mobile, space/click/touch pointer, mute, collision, result, best, navigation and no local points passed.');
}catch(e){try{await(await app.firstWindow()).screenshot({path:'tests/.generated/frame-run-failure.png',fullPage:true});}catch{}throw e;}finally{await app.close();}
