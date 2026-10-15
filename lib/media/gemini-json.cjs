const DEFAULT_MEDIA_MODEL = 'gemini-3.5-flash-lite';
async function generateMediaJson({ key, model = DEFAULT_MEDIA_MODEL, prompt, schema, image = undefined, onUsage = undefined, fetcher = fetch }) {
  if (!key || !/^gemini-[a-z0-9.-]+$/.test(model)) throw new Error('AI is not configured');
  const parts = [{ text: prompt }];
  if (image) parts.push({ inlineData: { mimeType: 'image/webp', data: image.toString('base64') } });
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, maxOutputTokens: 2048 } }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) { const error = new Error(response.status === 429 ? 'AI is busy. Try again later.' : 'AI request failed'); error.httpStatus = response.status; const retryAfter=Number(response.headers.get('retry-after'));if(Number.isFinite(retryAfter)&&retryAfter>0)error.retryAfterMs=Math.min(60000,retryAfter*1000);await response.body?.cancel();throw error; }
  const data = await response.json();
  if(onUsage)await onUsage(data.usageMetadata||{});
  const text = data.candidates?.[0]?.content?.parts?.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('') || '';
  try { return JSON.parse(text); } catch { throw new Error('AI returned an invalid response'); }
}
exports.generateMediaJson = generateMediaJson;
exports.DEFAULT_MEDIA_MODEL = DEFAULT_MEDIA_MODEL;
