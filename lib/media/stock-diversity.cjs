// Fixed labels make species/scene concentration visible without rescoring legacy stock.
exports.DETAILS = {
 cats: ['cats'], dogs: ['dogs'],
 'other-animals': ['monkeys','geese','birds','goats','horses','cows','pigs','sheep','rabbits','hamsters','squirrels','raccoons','foxes','bears','pandas','penguins','seals','otters','llamas','reptiles','insects','fish'],
 situations: ['workplace','social','family','sports','travel','chores','technology','school','shopping','celebration'],
 food: ['cooking','baking','spills','eating','presentation'],
 objects: ['broken','tangled','oversized','misplaced','faces','clutter'],
 history:['history'],art:['art']
};
const patterns={monkeys:/monkey|macaque|baboon|chimp|gorilla|orangutan/,geese:/goose|geese|gosling/,birds:/bird|owl|duck|parrot|ostrich|flamingo/,goats:/goat/,horses:/horse|pony|donkey/,cows:/cow|cattle/,pigs:/pig/,sheep:/sheep|lamb/,rabbits:/rabbit|bunny/,hamsters:/hamster|guinea pig/,squirrels:/squirrel/,raccoons:/raccoon/,foxes:/fox/,bears:/bear/,pandas:/panda/,penguins:/penguin/,seals:/seal|walrus/,otters:/otter/,llamas:/llama|alpaca/,reptiles:/lizard|turtle|snake|crocodile/,insects:/insect|bee|butterfly/,fish:/fish/,workplace:/office|meeting|business|workplace|coworker|colleague/,social:/friend|party|social|crowd|couple/,family:/family|parent|child|baby|grandparent/,sports:/sport|gym|exercise|football|basketball|yoga/,travel:/travel|airport|suitcase|train|traffic/,chores:/clean|laundry|chore|vacuum/,technology:/computer|phone|laptop|technology/,school:/school|student|classroom/,shopping:/shopping|store|checkout/,celebration:/birthday|celebrat|holiday/,cooking:/cook|kitchen/,baking:/bake|baking|cake|dough/,spills:/spill|mess/,eating:/eat|bite|hungry/,presentation:/plate|food|meal/,broken:/broken|repair/,tangled:/tangle|cable/,oversized:/oversiz|giant|tiny/,misplaced:/misplac|unexpected/,faces:/face|pareidolia/,clutter:/clutter|mess/};
exports.inferDetail=(asset,subject)=>{
 const explicit=asset.aiSuggestions?.subjectDetail||asset.diversity?.subjectDetail;
 if(exports.DETAILS[subject]?.includes(explicit))return explicit;
 if(subject==='cats'||subject==='dogs'||subject==='history'||subject==='art')return subject;
 const text=[asset.aiSuggestions?.sceneDescription,asset.aiSuggestions?.description,asset.title,asset.description,...(asset.aiSuggestions?.tags||asset.tags||[])].join(' ').toLowerCase();
 return (exports.DETAILS[subject]||[]).find(label=>patterns[label]?.test(text))||'unknown';
};
exports.diversityReason=(candidate,subject,{detailCounts,creatorCounts,nextTotal,maxDetailShare=.10,maxCreatorShare=.02})=>{
 const detail=exports.inferDetail(candidate,subject);
 if(detail==='unknown')return 'detail_assessment_required';
 // Cats/dogs remain governed by the separate subject gate.
 if(!['cats','dogs'].includes(subject)&&(detailCounts.get(subject+':'+detail)||0)+1>Math.max(3,Math.floor(nextTotal*maxDetailShare)))return 'detail_quota';
 if((creatorCounts.get(candidate.creator.trim().toLowerCase())||0)+1>Math.max(3,Math.floor(nextTotal*maxCreatorShare)))return 'creator_quota';
 return null;
};
exports.sceneText=asset=>asset.aiSuggestions?.sceneDescription||asset.aiSuggestions?.description||asset.description||'';
exports.photoSeriesMatch=(candidate,references,subject)=>{
 const creator=candidate.creator?.trim().toLowerCase(),detail=exports.inferDetail(candidate,subject);
 if(!creator||detail==='unknown')return null;
 const stop=new Set('a an the of on in at to and with is are one two its their this that'.split(' '));
 const words=text=>new Set((text.toLowerCase().match(/[a-z]+/g)||[]).filter(w=>w.length>2&&!stop.has(w)));
 const a=words(exports.sceneText(candidate));if(a.size<4)return null;
 for(const r of references){if(r.id===candidate.id||r.creator?.trim().toLowerCase()!==creator||r.subject!==subject||r.detail!==detail)continue;
  const b=words(r.scene||'');const shared=[...a].filter(w=>b.has(w)).length,union=new Set([...a,...b]).size;
  if(shared>=4&&shared/union>=.6)return {id:r.id,kind:'photo-series',overlap:shared/union};
 }
 return null;
};
