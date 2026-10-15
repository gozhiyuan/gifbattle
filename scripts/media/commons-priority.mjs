export function commonsPriority(candidate){
 const text=[candidate.humorSource?.category,candidate.collectionCategory,candidate.title,candidate.description].filter(Boolean).join(' ').toLowerCase();
 if(/taxiderm|antisemit|anti-semit|nazi|pornograph|lynching|execution/.test(text))return {score:0,reason:'sensitive_metadata'};
 if(/caricature|cartoon|illustration|engraving|satirical print|painting|coat of arms|palazzo|perspective gallery/.test(text))return {score:10,reason:'art_or_architecture'};
 if(/forced perspective|human interaction|photobomb|practical joke|humor photos|humorous photos/.test(text))return {score:100,reason:'humorous_photo_or_interaction'};
 if(/humorous animals|animal.*(interaction|mishap)|funny animals/.test(text))return {score:95,reason:'animal_situation'};
 if(/cat|dog|kitten|puppy/.test(text))return {score:65,reason:'common_pet'};
 if(/food|object|vehicle|sign|face in hole|pareidolia/.test(text))return {score:85,reason:'food_object_or_situation'};
 if(/historical|history|comic|satire/.test(text))return {score:20,reason:'broad_art_or_history'};
 return {score:50,reason:'general_humor'};
}
// Rotate categories within a priority band, so a large category cannot monopolize a batch.
export function prioritizeCommons(candidates){
 const groups=new Map();for(const c of candidates){const p=commonsPriority(c),key=`${p.score}:${c.humorSource?.category||'unknown'}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({...c,discoveryPriority:p});}
 const keys=[...groups.keys()].sort((a,b)=>Number(b.split(':')[0])-Number(a.split(':')[0])||a.localeCompare(b)),result=[];
 for(const score of [...new Set(keys.map(k=>Number(k.split(':')[0])))]){const matching=keys.filter(k=>Number(k.split(':')[0])===score);while(matching.some(k=>groups.get(k).length))for(const k of matching){const c=groups.get(k).shift();if(c)result.push(c);}}
 return result;
}
