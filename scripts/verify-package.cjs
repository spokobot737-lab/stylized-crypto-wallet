const {spawnSync}=require('node:child_process');
const {join}=require('node:path');
// Sprawdzenie rzeczywistych zależności wewnątrz ASAR, bez otwierania sejfu.
module.exports=async context=>{
 if(context.electronPlatformName!=='win32')return;
 const archive=join(context.appOutDir,'resources','app.asar');
 const code=`const {createRequire}=require('node:module');const r=createRequire(${JSON.stringify(join(archive,'package.json'))});for(const name of ['ethers','@solana/spl-token','@metaplex-foundation/mpl-core','@metaplex-foundation/mpl-token-metadata','ipaddr.js'])r(name);const codec=r('bigint-buffer');if(codec.toBigIntLE(codec.toBufferLE(1234567n,8))!==1234567n)throw Error('Niepoprawna konwersja USDC');try{r.resolve('ganache');throw Error('Zależność testowa w instalatorze');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}console.log('Zależności ASAR zweryfikowane');`;
 const result=spawnSync(join(context.appOutDir,'FRAME Wallet.exe'),['-e',code],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',timeout:30000,windowsHide:true});
 if(result.status!==0)throw new Error(`Weryfikacja pakietu nie powiodła się: ${result.stderr||result.error||result.stdout}`);
 console.log(result.stdout.trim());
};
