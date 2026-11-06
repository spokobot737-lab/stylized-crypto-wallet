import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMetadata,inspectFile} from '../electron/assets/creation';
import {createHash} from 'node:crypto';
import {remoteMetadata} from '../electron/assets/remote';
import {intentSchema} from '../electron/assets/transactions';
test('NFT storage preserves arbitrary bytes/hash in publicly retrievable embedded metadata',async()=>{
 for(const [filename,bytes] of [['note.txt',Buffer.from('Neutralny tekst')],['binary.bin',Buffer.from([0,1,2,255])]] as const){const r=await createMetadata({filename,name:'Test',description:'',base64:bytes.toString('base64'),storage:'embedded',publicConsent:true},{});const md=await remoteMetadata(r.uri);assert.equal(md.properties.frame_original.hash,createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(Buffer.from(md.properties.files[0].uri.split(',')[1],'base64'),bytes);assert.equal(intentSchema.safeParse({kind:'mint',chain:'ETH',network:'testnet',mode:'single',name:'Test',symbol:'F',uri:r.uri,items:[]}).success,true);}
});
test('NFT file storage rejects oversized/unacknowledged/unsupported hosting and distinguishes real format',async()=>{
 assert.equal(inspectFile(Buffer.from('%PDF-1.7')),'application/pdf');assert.equal(inspectFile(Buffer.from([0,255])),'application/octet-stream');const base={filename:'x.bin',name:'x',description:'',base64:Buffer.alloc(8193).toString('base64'),storage:'embedded',publicConsent:true};await assert.rejects(createMetadata(base,{}),/8 KiB/);await assert.rejects(createMetadata({...base,base64:'AA==',publicConsent:false},{}));await assert.rejects(createMetadata({...base,storage:'pinata'},{}),/Pinata/);
});
