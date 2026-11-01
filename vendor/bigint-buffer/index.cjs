'use strict';
// Zamiennik konwersji liczb SPL bez natywnych rozszerzeń i alokacji poza buforem.
function decode(bytes,little){
 if(!Buffer.isBuffer(bytes)||bytes.length>4096)throw new RangeError('Nieprawidłowy bufor liczby.');
 const data=little?Buffer.from(bytes).reverse():bytes;
 return data.length?BigInt('0x'+data.toString('hex')):0n;
}
function encode(value,width,little){
 if(typeof value!=='bigint'||value<0n||!Number.isInteger(width)||width<0||width>4096)throw new RangeError('Nieprawidłowa liczba lub szerokość.');
 if(value>=(1n<<BigInt(width*8)))throw new RangeError('Liczba przekracza szerokość bufora.');
 const data=width?Buffer.from(value.toString(16).padStart(width*2,'0'),'hex'):Buffer.alloc(0);
 return little?data.reverse():data;
}
exports.toBigIntLE=bytes=>decode(bytes,true);
exports.toBigIntBE=bytes=>decode(bytes,false);
exports.toBufferLE=(value,width)=>encode(value,width,true);
exports.toBufferBE=(value,width)=>encode(value,width,false);
