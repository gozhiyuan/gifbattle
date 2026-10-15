// Recover only exact, mutually consistent Creative Commons evidence from source metadata.
// Public-domain labels alone do not establish a jurisdiction or a license URL.
const plain=value=>String(value||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').trim();
export function commonsLicense(shortName,url){
 const label=plain(shortName);let parsed;
 try{parsed=new URL(plain(url));if(parsed.hostname==='creativecommons.org'&&['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password){parsed.protocol='https:';parsed.search='';parsed.hash='';}}catch{}
 const trusted=parsed&&parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&parsed.hostname==='creativecommons.org';
 const match=trusted&&/^\/licenses\/(by|by-sa)\/(2\.0|2\.5|3\.0|4\.0)\/?$/.exec(parsed.pathname);
 const zero=trusted&&/^\/publicdomain\/zero\/1\.0\/?$/.test(parsed.pathname);
 const exact=/^CC (BY(?:-SA)?) (2\.0|2\.5|3\.0|4\.0)$/i.exec(label);
 const canonical=match?`CC ${match[1].toUpperCase()} ${match[2]}`:zero?'CC0':null;
 const normalized=exact?`CC ${exact[1].toUpperCase()} ${exact[2]}`:/^CC0(?: 1\.0)?$/i.test(label)?'CC0':label;
 if(canonical&&(!label||normalized===canonical))return {license:canonical,licenseUrl:parsed.href,recovery:label?'canonicalized_source_license':'license_name_from_source_url'};
 if(!url&&exact)return {license:normalized,licenseUrl:`https://creativecommons.org/licenses/${exact[1].toLowerCase()}/${exact[2]}/`,recovery:'license_url_from_exact_source_name'};
 if(!url&&/^CC0(?: 1\.0)?$/i.test(label))return {license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',recovery:'license_url_from_exact_source_name'};
 return {license:normalized,licenseUrl:parsed?.href||plain(url),...(canonical&&label&&normalized!==canonical?{conflict:true}:{})};
}
export function repairCommonsMetadata(candidate){
 if(candidate.source!=='commons')return candidate;
 const license=commonsLicense(candidate.license,candidate.licenseUrl);
 // Do not silently reconcile conflicting URL/name assertions.
 if(license.conflict)return {...candidate,metadataConflict:'license_name_url_conflict'};
 if(license.license===candidate.license&&license.licenseUrl===candidate.licenseUrl)return candidate;
 const {recovery,...fields}=license;
 return {...candidate,...fields,...(recovery?{metadataRecovery:{reason:recovery,originalLicense:candidate.license,originalLicenseUrl:candidate.licenseUrl}}:{})};
}
