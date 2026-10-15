const SAFETY_POLICY = 'family-work-v1';
const SAFETY_CATEGORIES = ['sexual_content','nudity','graphic_violence','animal_cruelty','hate_or_harassment','offensive_text','drugs','dangerous_acts','disturbing_imagery'];
function normalizeSafety(value) {
 const checks={};for(const key of SAFETY_CATEGORIES)checks[key]=['clear','review','unsafe'].includes(value?.checks?.[key])?value.checks[key]:'review';
 const complete=SAFETY_CATEGORIES.every(key=>['clear','review','unsafe'].includes(value?.checks?.[key])) && typeof value?.safeForChildren==='boolean' && typeof value?.safeForWork==='boolean';
 const status=Object.values(checks).includes('unsafe')?'unsafe':complete&&value.safeForChildren&&value.safeForWork&&Object.values(checks).every(v=>v==='clear')?'safe':'review';
 return {policy:SAFETY_POLICY,status,safeForChildren:value?.safeForChildren===true,safeForWork:value?.safeForWork===true,checks};
}
function safetyPassed(candidate){const s=candidate.aiSuggestions?.safety||candidate.safety;return !familyMetadataHold(candidate)&&s?.status==='safe'&&s?.policy===SAFETY_POLICY&&normalizeSafety(s).status==='safe';}
exports.SAFETY_POLICY=SAFETY_POLICY;exports.SAFETY_CATEGORIES=SAFETY_CATEGORIES;exports.normalizeSafety=normalizeSafety;exports.safetyPassed=safetyPassed;
// Conservative discovery gate for content unsuitable for this family party game.
// This is a hold for review, not a legal judgment or a replacement for visual checks.
function familyMetadataHold(candidate){
 const text=[candidate.title,candidate.description,candidate.humorSource?.category,candidate.aiSuggestions?.title,candidate.aiSuggestions?.description].filter(Boolean).join(' ');
 return /\b(taxidermy|taxidermied|antisemitic|anti-semitic|nazism|nazi|pornographic|lynching|execution)\b/i.test(text)?'family_source_review_required':null;
}
exports.familyMetadataHold=familyMetadataHold;
