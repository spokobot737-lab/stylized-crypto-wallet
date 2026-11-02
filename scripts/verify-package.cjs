const {spawnSync}=require('node:child_process');
const {join}=require('node:path');
const {mkdtempSync,rmSync,existsSync}=require('node:fs');
const {tmpdir}=require('node:os');
// Resolve from an isolated extracted package: never fall back to the checkout's devDependencies.
module.exports=async context=>{
 if(context.electronPlatformName!=='win32')return;
 const archive=join(context.appOutDir,'resources','app.asar'),isolated=mkdtempSync(join(tmpdir(),'frame-package-'));
 try{
  require('@electron/asar').extractAll(archive,isolated);
  for(const name of ['ganache','playwright','tsx','typescript'])if(existsSync(join(isolated,'node_modules',name)))throw Error(`Zależność testowa w instalatorze: ${name}`);
  if(existsSync(join(isolated,'tests'))||existsSync(join(isolated,'dist-electron','ui-main.cjs')))throw Error('Fikstury testowe w instalatorze.');
  const code=`const {createRequire}=require('node:module');const r=createRequire(${JSON.stringify(join(isolated,'package.json'))});for(const name of ['ethers','@solana/spl-token','@metaplex-foundation/mpl-core','@metaplex-foundation/mpl-token-metadata','ipaddr.js','nostr-tools/pure','ws','image-size'])r(name);const codec=r('bigint-buffer');if(codec.toBigIntLE(codec.toBufferLE(1234567n,8))!==1234567n)throw Error('Niepoprawna konwersja stablecoinów');const {Resvg}=r('@resvg/resvg-js');if(new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>').render().asPng().length<30)throw Error('Brak rasteryzatora SVG');console.log('Zweryfikowano zależności pakietu, Nostr i natywny renderer SVG.');`;
  const result=spawnSync(join(context.appOutDir,'FRAME Wallet.exe'),['-e',code],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',timeout:30000,windowsHide:true});
  if(result.status!==0)throw new Error(`Weryfikacja pakietu nie powiodła się: ${result.stderr||result.error||result.stdout}`);
  console.log(result.stdout.trim());
 }finally{rmSync(isolated,{recursive:true,force:true});}
};
