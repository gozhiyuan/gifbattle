import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fingerprint,similarity,sceneSimilarity,hamming} from './similarity.mjs';
const svg=Buffer.from('<svg width="200" height="160"><rect width="200" height="160" fill="white"/><circle cx="50" cy="50" r="35" fill="red"/><rect x="110" y="40" width="50" height="100" fill="black"/></svg>');
test('perceptual fingerprints match resized/recompressed photos and reject a different composition',async()=>{
 const original=await fingerprint(await sharp(svg).png().toBuffer());
 const resized=await fingerprint(await sharp(svg).resize(600,480).jpeg({quality:55}).toBuffer());
 assert.ok(similarity(original,resized));
 const other=await fingerprint(await sharp(Buffer.from('<svg width="200" height="160"><rect width="200" height="160" fill="blue"/><path d="M0 0 L200 160 M200 0 L0 160" stroke="yellow" stroke-width="30"/></svg>')).png().toBuffer());
 assert.equal(similarity(original,other),null);
 assert.equal(hamming('0000000000000000','ffffffffffffffff'),64);
 assert.equal(hamming('bad','bad'),Infinity);
});
test('flat backgrounds cannot create perceptual false duplicates',async()=>{
 const make=color=>sharp({create:{width:40,height:40,channels:3,background:color}}).png().toBuffer();
 assert.equal(similarity(await fingerprint(await make('red')),await fingerprint(await make('blue'))),null);
});
test('photo-series detection needs matching creator, subject and visual evidence',()=>{
 const a={version:1,exactHash:'a',hash:'0000000000000000',cropHash:'0000000000000000',variance:1000,histogram:Array(24).fill(0.1)};
 const b={...a,exactHash:'b',hash:'000000000003ffff',cropHash:'000000000003ffff'};
 assert.equal(similarity(a,b),null);
 const options={creator:'A',referenceCreator:'A',subject:'cats',referenceSubject:'cats'};
 assert.equal(sceneSimilarity(a,b,options)?.kind,'similar-scene');
 assert.equal(sceneSimilarity(a,b,{...options,referenceCreator:'B'}),null);
 assert.equal(sceneSimilarity(a,b,{...options,subject:'unknown'}),null);
});
