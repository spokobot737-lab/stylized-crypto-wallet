// Headless Linux harness only. Production still uses native single-instance protection.
// The runner forbids Unix sockets; everything else loads from the unchanged app bundle.
try{
 const electron=require('electron');
 electron.app.disableHardwareAcceleration();
 electron.app.requestSingleInstanceLock=()=>true;
 require('../../dist-electron/main.cjs');
}catch(e){console.error(e);require('electron').app.exit(1);}
