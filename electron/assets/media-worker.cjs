// SVG jest rasteryzowany bez przeglądarki, skryptów, plików i sieci.
const {parentPort,workerData}=require('node:worker_threads');
try{const {Resvg}=require('@resvg/resvg-js');const svg=workerData;
 if(svg.length>262144||/<(?:script|foreignObject|image|feImage)\b|<!DOCTYPE|<!ENTITY|\bon\w+\s*=|(?:href\s*=\s*["'](?!#))|url\(\s*["']?(?!#)/i.test(svg))throw Error('SVG zawiera niedozwolone odwołania.');
 const probe=new Resvg(svg,{font:{loadSystemFonts:false}});if(!Number.isFinite(probe.width)||!Number.isFinite(probe.height)||probe.width<=0||probe.height<=0||probe.width/probe.height>100||probe.height/probe.width>100)throw Error('Nieprawidłowy rozmiar SVG.');
 const r=new Resvg(svg,{fitTo:{mode:'zoom',value:Math.min(512/probe.width,512/probe.height,1)},font:{loadSystemFonts:false}});parentPort.postMessage({png:r.render().asPng()});
}catch{parentPort.postMessage({error:'Nie można bezpiecznie wyrenderować obrazu SVG.'});}
