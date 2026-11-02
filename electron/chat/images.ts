import {nativeImage} from 'electron';
import {imageSize} from 'image-size';
export function normalizeChatImage(input:string,avatar=false){
 const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(input);if(!m||input.length>5600000)throw Error('Wybierz PNG, JPEG lub WebP do 4 MB.');const bytes=Buffer.from(m[2],'base64');if(bytes.length>4*1024*1024)throw Error('Obraz przekracza 4 MB.');const size=imageSize(bytes);if(!['png','jpg','webp'].includes(size.type||'')||!size.width||!size.height||size.width>4096||size.height>4096||size.width*size.height>12000000)throw Error('Nieprawidłowy format lub zbyt duży obraz.');
 const decoded=nativeImage.createFromBuffer(bytes);if(decoded.isEmpty())throw Error('Nie można odczytać obrazu.');
 const limit=avatar?3000:7200;let width=avatar?96:640;
 for(let round=0;round<6;round++){const factor=Math.min(1,width/size.width,width/size.height);const img=decoded.resize({width:Math.max(1,Math.round(size.width*factor)),height:Math.max(1,Math.round(size.height*factor)),quality:'good'});for(const quality of [72,55,38]){const jpg=img.toJPEG(quality);if(jpg.length<=limit)return `data:image/jpeg;base64,${jpg.toString('base64')}`;}width=Math.floor(width*.72);}
 throw Error('Nie można zmieścić obrazu w limicie małych obrazów Frame Chat.');
}
