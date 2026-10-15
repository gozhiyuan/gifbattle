import sharp from 'sharp';
import { createHash } from 'node:crypto';
// 64-bit DCT hashes retain broad image structure across resize/recompression.
function perceptualHash(pixels) {
 const coefficients = [];
 for (let u=0;u<8;u++) for (let v=0;v<8;v++) {
  let sum=0;
  for(let x=0;x<32;x++) for(let y=0;y<32;y++) sum+=pixels[y*32+x]*Math.cos((2*x+1)*u*Math.PI/64)*Math.cos((2*y+1)*v*Math.PI/64);
  coefficients.push(sum);
 }
 const sorted=coefficients.slice(1).sort((a,b)=>a-b), median=sorted[31];
 return coefficients.map((value,index)=>index && value>median?'1':'0').join('').match(/.{4}/g).map(bits=>parseInt(bits,2).toString(16)).join('');
}
export function hamming(a,b) {
 if(!/^[a-f0-9]{16}$/.test(a||'')||!/^[a-f0-9]{16}$/.test(b||'')) return Infinity;
 let n=BigInt('0x'+a)^BigInt('0x'+b),count=0;
 while(n){n&=n-1n;count++;}return count;
}
export async function fingerprint(bytes) {
 const image=sharp(bytes,{limitInputPixels:40000000}).rotate();
 const normalized=await image.clone().resize({width:128,height:128,fit:'inside'}).webp().toBuffer();
 const gray=await image.clone().resize(32,32,{fit:'fill'}).removeAlpha().grayscale().raw().toBuffer();
 const crop=await image.clone().resize(32,32,{fit:'cover',position:'centre'}).removeAlpha().grayscale().raw().toBuffer();
 const rgb=await image.clone().resize(16,16,{fit:'fill'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
 const histogram=Array(24).fill(0);
 for(let i=0;i<rgb.length;i+=3)for(let c=0;c<3;c++)histogram[c*8+Math.min(7,Math.floor(rgb[i+c]/32))]++;
 const mean=gray.reduce((a,b)=>a+b,0)/gray.length;
 const variance=gray.reduce((sum,value)=>sum+(value-mean)**2,0)/gray.length;
 return {version:1,exactHash:createHash('sha256').update(normalized).digest('hex'),hash:perceptualHash(gray),cropHash:perceptualHash(crop),histogram:histogram.map(n=>n/256),variance};
}
export function similarity(a,b) {
 if(!a||!b||a.version!==1||b.version!==1)return null;
 if(a.exactHash===b.exactHash)return {kind:'exact',distance:0};
 // Flat backgrounds have uninformative hashes; don't conflate unrelated blank images.
 if(a.variance<100||b.variance<100||!Array.isArray(a.histogram)||!Array.isArray(b.histogram))return null;
 const color=a.histogram.reduce((sum,n,i)=>sum+Math.abs(n-b.histogram[i]),0)/6;
 const distance=hamming(a.hash,b.hash),cropDistance=hamming(a.cropHash,b.cropHash);
 if(color<=0.12 && distance<=8)return {kind:'near',distance,color};
 if(color<=0.08 && cropDistance<=4)return {kind:'similar-scene',distance:cropDistance,color};
 return null;
}
export function sceneSimilarity(a,b,{creator,referenceCreator,subject,referenceSubject}={}) {
 const match=similarity(a,b);if(match)return match;
 if(!creator || creator!==referenceCreator || subject==='unknown' || !subject || subject!==referenceSubject || a?.variance<100 || b?.variance<100)return null;
 if(!a?.histogram || !b?.histogram)return null;
 const color=a.histogram.reduce((sum,n,i)=>sum+Math.abs(n-b.histogram[i]),0)/6;
 const distance=Math.min(hamming(a.hash,b.hash),hamming(a.cropHash,b.cropHash));
 // Same creator + subject + similar structure/color suggests a photo series, not an exact duplicate.
 if(distance<=24 && color<=0.25)return {kind:'similar-scene',distance,color};
 return null;
}
export function findSimilar(value, references, {creator,subject}={}) {
 for(const reference of references){const match=sceneSimilarity(value,reference.fingerprint,{creator,referenceCreator:reference.creator,subject,referenceSubject:reference.subject});if(match)return {id:reference.id,...match};}return null;
}
