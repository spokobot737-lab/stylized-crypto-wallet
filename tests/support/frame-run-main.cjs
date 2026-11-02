// UI-only fixture: no wallet, no credentials and no point balance are fabricated.
const {app,BrowserWindow}=require('electron');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const {resolve,sep,extname}=require('node:path');
(async()=>{
 app.disableHardwareAcceleration();await app.whenReady();
 const root=resolve('dist');
 const server=createServer(async(req,res)=>{
  const file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const window=new BrowserWindow({width:1440,height:1000,show:true,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,sandbox:true}});
 await window.loadURL('http://127.0.0.1:'+server.address().port+'/index.html');
 app.on('window-all-closed',()=>{server.close();app.quit();});
})().catch(e=>{console.error(e);app.exit(1);});
