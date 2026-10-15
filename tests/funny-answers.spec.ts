import {test,expect} from '@playwright/test';
import {reviseMemeAnswer,suggestFunnyAnswers} from '../lib/media/funny-answers';
import {memeImagePrompt} from '../lib/media/meme-image-prompt';
import {CHOICE_MODE_POLICY} from '../lib/answer-modes';
const body={code:'ABC123',pid:'p',token:'token',gameId:Date.now()+600000,roundIndex:0,draft:'My joke'};
const room={phase:'submitting',submitDeadline:body.gameId,players:[{id:'p'}],prompts:['When dinner is late'],roundPlan:[{participants:['p'],answerMode:'meme'}]};
const deps=()=>({getRoom:async()=>room,validToken:async()=>true,getKey:async()=>'key',rateLimit:async()=>({allowed:true,retryAfterSec:0}),suggest:async()=>['A funnier joke']});
test('AI rewriting uses canonical room context and requires a current authorized Meme question',async()=>{
 let calls=0;const d={...deps(),suggest:async(prompt,draft)=>{calls++;expect(prompt).toBe(room.prompts[0]);expect(draft).toBe('My joke');return ['A funnier joke'];}};
 expect(await reviseMemeAnswer(body,d)).toEqual({suggestions:['A funnier joke']});
 for(const override of [{validToken:async()=>false},{getRoom:async()=>({...room,phase:'game_over'})},{getRoom:async()=>({...room,roundPlan:[{participants:['p'],answerMode:'giphy'}]})},{getKey:async()=>''},{rateLimit:async()=>({allowed:false,retryAfterSec:30})}])await expect(reviseMemeAnswer(body,{...d,...override})).rejects.toBeTruthy();
 expect(calls).toBe(1);
 await expect(reviseMemeAnswer({...body,draft:'x'.repeat(281)},d)).rejects.toMatchObject({code:'invalid_request'});
});
test('funny answer responses are bounded and distinct, and meme generation asks for the actual caption',async()=>{
 const suggestions=await suggestFunnyAnswers('Dinner','My draft','fake-key',async(_url,init)=>{
  expect(JSON.parse(init.body as string).contents[0].parts[0].text).toContain('My draft');
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({suggestions:[' Joke one ','Joke one','Joke two',123]})}]}}]});
 });expect(suggestions).toEqual(['Joke one','Joke two']);
 const prompt=memeImagePrompt('comic','When dinner is late','MY LAST TWO BRAIN CELLS');
 expect(prompt).toContain('exactly as supplied');expect(prompt).toContain('MY LAST TWO BRAIN CELLS');
});
test('normal games permit AI writing on any question when the player chooses Meme',async()=>{
 const normal={...room,answerModePolicy:CHOICE_MODE_POLICY,roundPlan:[{participants:['p'],answerMode:'giphy'}]};
 expect(await reviseMemeAnswer(body,{...deps(),getRoom:async()=>normal})).toEqual({suggestions:['A funnier joke']});
});

test('AI image inspiration comes from catalog metadata and still requires an original scene',()=>{
 const prompt=memeImagePrompt('comic','Dinner','WHERE IS MY DINNER',{title:'Hungry cat',description:'A cat looking at an empty bowl'});
 expect(prompt).toContain('Hungry cat');expect(prompt).toContain('empty bowl');expect(prompt).toContain('new original scene');expect(prompt).toContain('WHERE IS MY DINNER');
});

test('AI rewrites use the room model and canonical template limit', async () => {
 const d = {...deps(), getRoom:async()=>({...room,geminiModel:'gemini-3.6-flash'}),
  findTemplate:async()=>({captionMaxLength:40}),
  suggest:async(prompt,draft,key,limit,model)=>{expect(draft).toBe('My joke');expect(limit).toBe(40);expect(model).toBe('gemini-3.6-flash');return ['My sharper joke'];}};
 expect(await reviseMemeAnswer({...body,templateId:'cat'},d)).toEqual({suggestions:['My sharper joke']});
 await expect(reviseMemeAnswer({...body,templateId:'missing'},{...d,findTemplate:async()=>undefined})).rejects.toMatchObject({code:'invalid_template'});
});

test('overlong generated captions are rejected instead of silently truncating jokes', async () => {
 const values = await suggestFunnyAnswers('Dinner','My draft','key',async(url,init)=>{
  expect(String(url)).toContain('gemini-3.8-flash');
  const request=JSON.parse(init.body as string);
  expect(request.generationConfig.responseJsonSchema.properties.suggestions.items.maxLength).toBe(40);
  expect(request.contents[0].parts[0].text).toContain('REWRITE that draft');
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({suggestions:['x'.repeat(41),'Still waiting for dinner']})}]}}]});
 },40);
 expect(values).toEqual(['Still waiting for dinner']);
});
