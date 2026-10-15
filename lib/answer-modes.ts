export type AnswerMode = 'giphy' | 'meme';
export const ANSWER_MODE_POLICY = 'alternate-v2';
export const CHOICE_MODE_POLICY = 'choice-v2';
export function isChoiceMode(state:any):boolean {return state?.answerModePolicy === CHOICE_MODE_POLICY;}
export function allowsAnswerMode(state:any,index:number,mode:AnswerMode,gifsAvailable=true):boolean {
 return isChoiceMode(state) && !state.answerModeOverrides?.[index] ? mode === 'meme' || gifsAvailable : getAnswerMode(state,index,gifsAvailable) === mode;
}
export const answerModeLabels: Record<AnswerMode, string> = {giphy:'GIF answer',meme:'Meme answer'};
export function modeForCycle(cycle: number, gifsAvailable = true): AnswerMode {
 const mode = (['giphy','meme'] as const)[Math.max(0,Math.floor(cycle)) % 2];
 return mode === 'giphy' && !gifsAvailable ? 'meme' : mode;
}
export function getAnswerMode(state: any, index: number, gifsAvailable = true): AnswerMode {
 const override = state?.answerModeOverrides?.[index];
 if (override === 'meme' || override === 'write') return 'meme';
 const entry = state?.roundPlan?.[index];
 const mode = entry?.answerMode;
 if (mode === 'write' || mode === 'meme') return 'meme';
 if (mode === 'giphy') return gifsAvailable ? 'giphy' : 'meme';
 return modeForCycle(Number.isInteger(entry?.cycle) ? entry.cycle : index, gifsAvailable);
}
export function submissionMatchesMode(mode: AnswerMode, submission: any): boolean {
 return mode === 'meme' ? ['meme','text','ai'].includes(submission?.type) :
  submission?.type === 'giphy' || submission?.type === 'media' && ['giphy','klipy'].includes(submission?.source);
}
export function validSubmissionModes(previous: any, next: any): boolean {
 if (![ANSWER_MODE_POLICY,CHOICE_MODE_POLICY,'rotate-v1'].includes(next.answerModePolicy)) return true;
 for (const [pid, submissions] of Object.entries(next.submissions || {})) {
  if (!Array.isArray(submissions)) return false;
  for (let index=0;index<submissions.length;index++) {
   const submission=submissions[index];if(!submission)continue;
   // A fallback changes the required format for unanswered players, preserving
   // answers already submitted before the provider became unavailable.
   if (previous.submitDeadline === next.submitDeadline && JSON.stringify(previous.submissions?.[pid]?.[index]) === JSON.stringify(submission)) continue;
   if (!submissionAllowedForQuestion(next,index,submission)) return false;
  }
 }
 return true;
}
export function submissionAllowedForQuestion(state:any,index:number,submission:any,gifsAvailable=true):boolean {
 return (allowsAnswerMode(state,index,'giphy',gifsAvailable)&&submissionMatchesMode('giphy',submission)) ||
  (allowsAnswerMode(state,index,'meme',gifsAvailable)&&submissionMatchesMode('meme',submission));
}
