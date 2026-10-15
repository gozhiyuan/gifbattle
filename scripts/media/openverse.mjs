import {jsonRequest,commonsCandidates} from './library.mjs';
import {safeHttps} from '../../lib/media/catalog-schema.cjs';
export async function searchOpenverse(query,limit=20,page=1){
 if(!query?.trim()||!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(page)||page<1)throw new Error('Use query, limit 1–50 and positive page');
 const url=new URL('https://api.openverse.org/v1/images/');url.search=new URLSearchParams({q:query,page_size:String(limit),page:String(page),license:'cc0,pdm,by,by-sa',mature:'false',source:process.env.OPENVERSE_SOURCES||'wikimedia,met'}).toString();
 const data=await jsonRequest(url,{'User-Agent':'GIFBattlesAssetImporter/1.0 (licensed catalog curation)'});
 const results=(data.results||[]).filter(r=>r.mature===false&&safeHttps(r.foreign_landing_url)&&safeHttps(r.url));
 const titles=[...new Set(results.filter(r=>new URL(r.foreign_landing_url).hostname==='commons.wikimedia.org').map(r=>decodeURIComponent(new URL(r.foreign_landing_url).pathname).replace(/^\/wiki\//,'')).filter(t=>t.startsWith('File:')))];
 const verified=new Map();
 for(let i=0;i<titles.length;i+=20){const api=new URL('https://commons.wikimedia.org/w/api.php');api.search=new URLSearchParams({action:'query',format:'json',titles:titles.slice(i,i+20).join('|'),prop:'imageinfo',iiprop:'url|size|mime|extmetadata',iiurlwidth:'400',redirects:'1'}).toString();for(const c of commonsCandidates(await jsonRequest(api,{'User-Agent':'GIFBattlesAssetImporter/1.0'}),query))verified.set(decodeURIComponent(new URL(c.sourceUrl).pathname),c);}
 const candidates=[];let pageVerifications=0;
 for(const r of results){const landing=new URL(r.foreign_landing_url);let c=verified.get(decodeURIComponent(landing.pathname));
  try {
  if(!c&&landing.hostname==='www.metmuseum.org'&&pageVerifications<8){
   pageVerifications++;
   const match=landing.pathname.match(/\/collection\/search\/(\d+)$/);if(match){const object=await jsonRequest(new URL(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${match[1]}`));if(object.isPublicDomain===true&&safeHttps(object.primaryImage)&&new URL(object.primaryImage).hostname==='images.metmuseum.org')c={id:`met-${object.objectID}`,source:'met',title:object.title||r.title,description:object.title||'',sourceUrl:object.objectURL||r.foreign_landing_url,creator:object.artistDisplayName||object.culture||'Unknown artist',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',downloadUrl:object.primaryImage,thumbnailUrl:object.primaryImageSmall||object.primaryImage,width:r.width,height:r.height,mime:'image/jpeg',attribution:{label:`The Metropolitan Museum of Art · ${object.creditLine||'Open Access'}`,url:object.objectURL||r.foreign_landing_url},reviewStatus:'pending',categories:[],tags:[query],permissionRecord:'',captionable:false};}
  }
  if(!c&&['www.flickr.com','flickr.com'].includes(landing.hostname)&&pageVerifications<8){
   const photo=landing.pathname.match(/^\/photos\/[^/]+\/(\d+)\/?$/),image=new URL(r.url);
   if(photo&&/^(live|farm[0-9]+|c[0-9]+)\.staticflickr\.com$/.test(image.hostname)&&image.pathname.split('/').pop().startsWith(photo[1]+'_')&&['by','by-sa','cc0','pdm'].includes(r.license)){
    pageVerifications++;
    const response=await fetch(landing,{redirect:'error',signal:AbortSignal.timeout(15000)});
    if(response.ok){let bytes=0,parts=[];for await(const chunk of response.body){bytes+=chunk.length;if(bytes>2*1024*1024)throw new Error('Source page exceeds verification limit');parts.push(chunk);}const html=Buffer.concat(parts).toString('utf8').replace(/\\\//g,'/').replaceAll('http://creativecommons.org/','https://creativecommons.org/');
     const expected=r.license==='cc0'?'https://creativecommons.org/publicdomain/zero/1.0/':r.license==='pdm'?'https://creativecommons.org/publicdomain/mark/1.0/':`https://creativecommons.org/licenses/${r.license}/${r.license_version}/`;
     if(html.includes(expected)&&html.includes(photo[1])&&r.creator?.trim())c={id:`flickr-${photo[1]}`,source:'flickr',title:r.title||'',description:r.title||'',sourceUrl:landing.href,creator:r.creator,license:r.license==='cc0'?'CC0':r.license==='pdm'?'Public domain':`CC ${r.license==='by'?'BY':'BY-SA'} ${r.license_version}`,licenseUrl:expected,width:r.width,height:r.height,mime:'image/jpeg',downloadUrl:r.url,thumbnailUrl:r.url.replace(/_([a-z])\.(jpe?g|png)$/,'_z.$2'),attribution:{label:`${r.creator} · ${r.license.toUpperCase()}`,url:landing.href},reviewStatus:'pending',categories:[],tags:[query],captionable:false};
    }else{await response.body?.cancel();if([401,403,429].includes(response.status))pageVerifications=8;}
   }
  }
  }catch(error){if(error.httpStatus===429)pageVerifications=8;}
  if(c)candidates.push({...c,discoveredVia:'openverse',openverseId:r.id,sourceVerification:{status:'verified',method:c.source==='commons'?'commons-imageinfo':c.source==='met'?'met-public-domain-api':'flickr-public-page-license-link',checkedAt:new Date().toISOString()}});
  else candidates.push({id:`openverse-${r.id}`,source:'openverse',sourceUrl:r.foreign_landing_url,title:r.title||'',description:'',creator:r.creator||'',license:r.license,licenseUrl:r.license_url,downloadUrl:r.url,thumbnailUrl:r.thumbnail,width:r.width,height:r.height,mime:'image/jpeg',reviewStatus:'pending',categories:[],tags:[query],captionable:false,sourceVerification:{status:'pending',reason:'original_source_verification_required'},attribution:{label:r.attribution||r.creator||'',url:r.foreign_landing_url}});
 }
 return candidates;
}
