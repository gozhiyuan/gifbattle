import {NextRequest,NextResponse} from 'next/server';
import {getRoomState,isValidRoomPlayerToken,getRoomGeminiKey,checkRoomRateLimit} from '@/lib/room-security';
import {reviseMemeAnswer,suggestFunnyAnswers,FunnyAnswerError} from '@/lib/media/funny-answers';
export const maxDuration=60;
export async function POST(request:NextRequest) {
 let body;try{const text=await request.text();if(text.length>4096)throw new Error();body=JSON.parse(text);}catch{return NextResponse.json({error:'invalid_request'},{status:400});}
 try{return NextResponse.json(await reviseMemeAnswer(body,{getRoom:getRoomState,validToken:isValidRoomPlayerToken,getKey:getRoomGeminiKey,rateLimit:code=>checkRoomRateLimit(code,'caption'),suggest:suggestFunnyAnswers}));}
 catch(error){if(error instanceof FunnyAnswerError)return NextResponse.json({error:error.code,retryAfter:error.retryAfter},{status:error.status});return NextResponse.json({error:'answer_suggestions_unavailable'},{status:503});}
}
