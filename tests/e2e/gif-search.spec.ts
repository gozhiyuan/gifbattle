import { expect, test, Page } from "@playwright/test";
import { installGameApiMocks } from "./helpers/mock-api";

async function submissionScreen(page: Page, store: Map<string, string>) {
  await installGameApiMocks(page.context(), store);
  await page.route("**/api/gif-events", route => route.fulfill({ json: { ok: true } }));
  await page.goto("/");
  await page.getByPlaceholder("Your nickname").fill("Host");
  await page.getByRole("button", { name: /create room/i }).click();
  await expect(page.getByText("LOBBY", { exact: true })).toBeVisible();
  const code = await page.evaluate(() => localStorage.getItem("gifbattle_last_room")!);
  const key = `gifbattle:room:${code}`;
  const room = JSON.parse(store.get(key)!);
  Object.assign(room, { phase: "submitting", prompts: ["When dinner arrives"], rounds: 1,
    submitDeadline: Date.now() + 180000 });
  store.set(key, JSON.stringify(room));
  await expect(page.getByText('"When dinner arrives"', { exact: true })).toBeVisible();
  test.skip(!(await page.getByPlaceholder("Search GIFs").isVisible()), "Build with a provider key to test GIF search");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
  return { key, room };
}

test("typing is free; explicit search and pagination keep the query; generic categories are removed", async ({ page }) => {
  const store = new Map<string, string>();
  const searches: URL[] = [];
  let permits = 0;
  await page.route("**/api/gif-search-budget", route => { permits++; return route.fulfill({ json: { ok: true } }); });
  await page.route("https://api.giphy.com/**", route => {
    const url = new URL(route.request().url()); searches.push(url);
    return route.fulfill({ json: { data: Array.from({ length: 24 }, (_, id) => ({ id: `${url.searchParams.get("offset")}-${id}`,
      images: { fixed_height: { url: "/powered-by-giphy.gif" }, fixed_height_small: { url: "/powered-by-giphy.gif" } } })), pagination: { total_count: 48 } } });
  });
  await submissionScreen(page, store);
  test.skip(!(await page.getByPlaceholder("Search GIFs").isVisible()), "Requires GIPHY as primary");
  const input = page.getByPlaceholder("Search GIFs");
  await input.fill("cat");
  await expect(input).toHaveValue("cat");
  // Wait longer than the old debounce without making a request.
  await page.waitForTimeout(700);
  expect(searches).toHaveLength(0);
  expect(permits).toBe(0);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("button", { name: "Load more GIFs" })).toBeVisible();
  expect(searches[0].searchParams.get("limit")).toBe("24");
  await input.fill("dog");
  await page.getByRole("button", { name: "Load more GIFs" }).click();
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1].searchParams.get("q")).toBe("cat");
  expect(searches[1].searchParams.get("offset")).toBe("24");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
  await input.press("Enter");
  await expect.poll(() => searches.length).toBe(3);
  expect(searches[2].searchParams.get("q")).toBe("dog");
  await expect(page.getByRole("button", { name: "Awkward", exact: true })).toHaveCount(0);
});

test("both exhausted budgets send no provider request and switch the question to memes", async ({ page }) => {
  const store = new Map<string, string>();
  let external = 0;
  await page.route("**/api/gif-search-budget", route => route.fulfill({ status: 429, json: { retryAfter: 120 } }));
  await page.route("https://api.giphy.com/**", route => { external++; return route.abort(); });
  await submissionScreen(page, store);
  test.skip(!(await page.getByPlaceholder("Search GIFs").isVisible()), "Requires GIPHY as primary");
  await page.getByPlaceholder("Search GIFs").fill("cat");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText(/This question now uses Meme mode/)).toBeVisible();
  expect(external).toBe(0);
  await expect(page.getByPlaceholder("Your answer or meme idea…")).toBeVisible();
});


test("KLIPY selection retains source, reports original query, and credits results alongside legacy GIPHY", async ({ page }) => {
  const store = new Map<string, string>();
  let shared: Record<string, unknown> | undefined;
  await page.route("**/api/gif-search-budget", route => route.fulfill({ status: route.request().postDataJSON().provider === "giphy" ? 429 : 200, json: { ok: true, retryAfter: 120 } }));
  await page.route("https://api.klipy.com/**", route => {
    if (route.request().method() === "POST") {
      shared = route.request().postDataJSON();
      return route.fulfill({ json: { result: true } });
    }
    return route.fulfill({ json: { result: true, data: { has_next: false, data: [{ id: 123, slug: "happy-cat", file: {
      hd: { gif: { url: "/powered-by-giphy.gif", width: 200, height: 100 } },
      sm: { gif: { url: "/powered-by-giphy.gif" } },
    } }] } } });
  });
  const { key, room } = await submissionScreen(page, store);
  test.skip(!(await page.getByPlaceholder("Search GIFs").isVisible()), "Requires a configured KLIPY key");
  const guest = { id: "guest", nickname: "Guest", score: 0 };
  room.players.push(guest);
  store.set(key, JSON.stringify(room));
  const input = page.getByPlaceholder("Search GIFs");
  await input.fill("happy cat");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
  await expect(page.getByText("Powered by KLIPY", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/gifbattle-klipy-search.png", fullPage: true });
  await page.locator('img[loading="lazy"]').first().click();
  await page.locator('img[loading="lazy"]').first().click();
  await expect(page.getByText("Powered by KLIPY", { exact: true })).toHaveCount(1);
  await input.fill("different text");
  await page.getByRole("button", { name: "Submit GIF", exact: true }).click();
  await expect.poll(() => shared?.q).toBe("happy cat");
  const saved = JSON.parse(store.get(key)!);
  expect(saved.submissions[saved.host][0]).toMatchObject({ type: "media", source: "klipy", assetId: "klipy:123" });
  saved.submissions.guest = [{ type: "giphy", url: "/powered-by-giphy.gif" }];
  saved.phase = "game_over";
  store.set(key, JSON.stringify(saved));
  await expect(page.getByText("GAME SUMMARY", { exact: true })).toBeVisible();
  await expect(page.getByText("Powered by KLIPY", { exact: true })).toBeVisible();
  await expect(page.getByAltText("Powered By GIPHY")).toBeVisible();
});

test('one GIF search automatically changes provider on quota exhaustion and clears the old selection', async ({ page }) => {
  const store = new Map<string, string>(); let limited = false;
  await page.route('**/api/gif-search-budget', route => route.fulfill({ status: limited && route.request().postDataJSON().provider === 'giphy' ? 429 : 200, json: { ok: true, retryAfter: 120 } }));
  await page.route('https://api.giphy.com/**', route => route.fulfill({ json: { data: [{ id: 'one', images: { original: { url: '/powered-by-giphy.gif' }, fixed_width_small: { url: '/powered-by-giphy.gif' } } }], pagination: { total_count: 1 } } }));
  await page.route('https://api.klipy.com/**', route => route.fulfill({ json: { result: true, data: { has_next: false, data: [{ id: 1, slug: 'cat', file: { hd: { gif: { url: '/powered-by-giphy.gif' } } } }] } } }));
  await submissionScreen(page, store);
  await expect(page.getByRole('group', { name: 'GIF provider' })).toHaveCount(0);
  const input = page.getByPlaceholder('Search GIFs');
  await input.fill('cat'); await input.press('Enter');
  await expect(page.locator('img[loading="lazy"]')).toHaveCount(1); await page.locator('img[loading="lazy"]').click();
  await expect(page.getByRole('button', { name: 'Submit GIF', exact: true })).toBeEnabled();
  limited = true; await input.fill('dog'); await input.press('Enter');
  await expect(page.getByText('Powered by KLIPY', { exact: true })).toHaveCount(1);
  await expect(page.getByAltText('Powered By GIPHY')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select a GIF first', exact: true })).toBeDisabled();
  await page.locator('img[loading="lazy"]').click();
  await expect(page.getByText('Powered by KLIPY', { exact: true })).toHaveCount(1);
});

test('quota fallback preserves the question and can retry if saving the shared mode fails', async ({ page }) => {
  const store = new Map<string,string>();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/gif-search-budget',route=>route.fulfill({status:429,json:{retryAfter:120}}));
  await submissionScreen(page,store);
  let fail=true;
  await page.route('**/api/room/state',route=>{
    if(fail){fail=false;return route.fulfill({status:503,json:{error:'temporary_failure'}});}
    return route.fallback();
  });
  await page.getByPlaceholder('Search GIFs').fill('cat');await page.getByRole('button',{name:'Search',exact:true}).click();
  await expect(page.getByText(/mode change could not be saved/)).toBeVisible();
  await expect(page.getByPlaceholder('Search GIFs')).toBeVisible();
  await page.getByRole('button',{name:'Switch this question to Meme',exact:true}).click();
  await expect(page.getByPlaceholder('Your answer or meme idea…')).toBeVisible();
  expect(errors).toEqual([]);
});


test('pagination exhaustion replaces the grid and attribution with a fresh alternate-provider search',async({page})=>{
 const store=new Map<string,string>();let limited=false;let klipyQuery='';
 await page.route('**/api/gif-search-budget',route=>route.fulfill({status:limited && route.request().postDataJSON().provider==='giphy'?429:200,json:{ok:true,retryAfter:120}}));
 await page.route('https://api.giphy.com/**',route=>route.fulfill({json:{data:Array.from({length:24},(_,id)=>({id:String(id),images:{fixed_height:{url:'/powered-by-giphy.gif'},fixed_height_small:{url:'/powered-by-giphy.gif'}}})),pagination:{total_count:48}}}));
 await page.route('https://api.klipy.com/**',route=>{klipyQuery=new URL(route.request().url()).searchParams.get('q')||'';return route.fulfill({json:{result:true,data:{has_next:false,data:[{id:123,file:{hd:{gif:{url:'/powered-by-giphy.gif'}}}}]}}});});
 await submissionScreen(page,store);
 await page.getByPlaceholder('Search GIFs').fill('cat');await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.locator('img[loading="lazy"]').first().click();limited=true;
 await page.getByPlaceholder('Search GIFs').fill('different draft');
 await page.getByRole('button',{name:'Load more GIFs',exact:true}).click();
 await expect(page.getByText('Powered by KLIPY',{exact:true})).toBeVisible();
 await expect(page.locator('img[loading="lazy"]')).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Select a GIF first',exact:true})).toBeDisabled();
 expect(klipyQuery).toBe('cat');
});

test('exhaustion during pagination switches only the current question and preserves submitted GIFs',async({page})=>{
 const store=new Map<string,string>();let limited=false;
 await page.route('**/api/gif-search-budget',route=>route.fulfill({status:limited?429:200,json:{ok:true,retryAfter:120}}));
 await page.route('https://api.giphy.com/**',route=>route.fulfill({json:{data:Array.from({length:24},(_,id)=>({id:String(id),images:{fixed_height:{url:'/powered-by-giphy.gif'},fixed_height_small:{url:'/powered-by-giphy.gif'}}})),pagination:{total_count:48}}}));
 const {key,room}=await submissionScreen(page,store);
 room.prompts=['When dinner arrives','Another question','Later GIF question'];
 room.roundPlan=room.prompts.map((_,index)=>({cycle:index,heat:0,heatsInCycle:1,participants:[room.host,'guest'],answerMode:index===1?'meme':'giphy'}));
 room.players.push({id:'guest',nickname:'Guest',score:0});room.submissions={guest:[{type:'giphy',url:'/powered-by-giphy.gif'}]};store.set(key,JSON.stringify(room));
 await page.getByPlaceholder('Search GIFs').fill('cat');await page.getByRole('button',{name:'Search',exact:true}).click();
 limited=true;await page.getByRole('button',{name:'Load more GIFs',exact:true}).click();
 await expect(page.getByPlaceholder('Your answer or meme idea…')).toBeVisible();
 const fresh=JSON.parse(store.get(key)!);expect(fresh.answerModeOverrides).toEqual({'0':'meme'});
 expect(fresh.roundPlan[2].answerMode).toBe('giphy');expect(fresh.submissions.guest[0].type).toBe('giphy');
});

test('a temporary GIF search failure keeps existing results and permits retry without switching mode',async({page})=>{
 const store=new Map<string,string>();let failing=false;const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/gif-search-budget',route=>route.fulfill({status:failing?503:200,json:{ok:true}}));
 await page.route('https://api.giphy.com/**',route=>route.fulfill({json:{data:[{id:'one',images:{original:{url:'/powered-by-giphy.gif'},fixed_width_small:{url:'/powered-by-giphy.gif'}}}],pagination:{total_count:1}}}));
 const {key}=await submissionScreen(page,store);
 await page.getByPlaceholder('Search GIFs').fill('cat');await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.locator('img[loading="lazy"]').click();failing=true;await page.getByRole('button',{name:'Search',exact:true}).click();
 await expect(page.getByText(/temporarily unavailable/)).toBeVisible();await expect(page.getByRole('button',{name:'Submit GIF',exact:true})).toBeEnabled();
 expect(JSON.parse(store.get(key)!).answerModeOverrides?.[0]).toBeUndefined();
 failing=false;await page.getByRole('button',{name:'Search',exact:true}).click();await expect(page.getByText(/temporarily unavailable/)).toHaveCount(0);expect(errors).toEqual([]);
});
