import {test,expect} from '@playwright/test';
import {getAnswerMode,modeForCycle,validSubmissionModes,ANSWER_MODE_POLICY,CHOICE_MODE_POLICY,allowsAnswerMode} from '../lib/answer-modes';
test('question modes rotate by round cycle, including multiple heats and resumed players',()=>{
 expect(Array.from({length:6},(_,i)=>modeForCycle(i))).toEqual(['giphy','meme','giphy','meme','giphy','meme']);
 const state={roundPlan:[{cycle:0},{cycle:0},{cycle:1},{cycle:1},{cycle:2}]};
 expect(state.roundPlan.map((_,index)=>getAnswerMode(state,index))).toEqual(['giphy','giphy','meme','meme','giphy']);
 expect(getAnswerMode(state,0,false)).toBe('meme');
});
test('normal mode accepts either answer format on each question and allows Meme AI on GIF-numbered rounds',()=>{
 const state={answerModePolicy:CHOICE_MODE_POLICY,roundPlan:[{cycle:0,answerMode:'giphy'},{cycle:1,answerMode:'meme'}],submissions:{}};
 for(const submission of [{type:'giphy'},{type:'media',source:'klipy'},{type:'meme'},{type:'text'},{type:'ai'}]) {
  expect(validSubmissionModes(state,{...state,submissions:{p:[submission,submission]}})).toBe(true);
 }
 expect(allowsAnswerMode(state,0,'meme')).toBe(true);
 expect(validSubmissionModes(state,{...state,submissions:{p:[{type:'media',source:'local'}]}})).toBe(false);
 expect(validSubmissionModes(state,{...state,answerModeOverrides:{0:'meme'},submissions:{p:[{type:'giphy'}]}})).toBe(false);
});
test('required mode rejects a different format and preserves earlier GIFs after a shared fallback',()=>{
 const previous={answerModePolicy:ANSWER_MODE_POLICY,submitDeadline:123,roundPlan:[{cycle:0},{cycle:1},{cycle:2}],submissions:{}};
 for(const [index,type,source] of [[0,'media','klipy'],[1,'meme','local'],[1,'text',undefined],[1,'ai',undefined]] as const){
  const submissions={p:Array.from({length:index+1},(_,i)=>i===index?{type,source}:null)};
  expect(validSubmissionModes(previous,{...previous,submissions})).toBe(true);
 }
 expect(validSubmissionModes(previous,{...previous,submissions:{p:[{type:'text'}]}})).toBe(false);
 expect(validSubmissionModes(previous,{...previous,submissions:{p:[null,{type:'media',source:'giphy'}]}})).toBe(false);
 const submitted={...previous,submissions:{p:[{type:'giphy',url:'a'}]}};
 expect(validSubmissionModes(submitted,{...submitted,answerModeOverrides:{0:'meme'},submissions:{...submitted.submissions,q:[{type:'meme'}]}})).toBe(true);
 expect(validSubmissionModes(submitted,{...submitted,answerModeOverrides:{0:'meme'},submissions:{...submitted.submissions,q:[{type:'giphy',url:'b'}]}})).toBe(false);
});
