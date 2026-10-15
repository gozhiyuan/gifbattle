import {test,expect} from '@playwright/test';
import {installGameApiMocks} from './helpers/mock-api';
import manifest from '../../public/media/catalog.json';

test('three questions alternate GIF and Meme without a separate writing mode',async({page})=>{
 const store=new Map<string,string>();await installGameApiMocks(page.context(),store);
 await page.route('**/api/gif-events',route=>route.fulfill({json:{ok:true}}));
 await page.route('**/api/media/events',route=>route.fulfill({json:{ok:true}}));
 await page.route('**/api/gif-search-budget',route=>route.fulfill({json:{ok:true}}));
 await page.route('https://api.giphy.com/**',route=>route.fulfill({json:{data:[{id:'one',images:{original:{url:'/powered-by-giphy.gif'},fixed_width_small:{url:'/powered-by-giphy.gif'}}}],pagination:{total_count:1}}}));
 await page.route('https://api.klipy.com/**',route=>route.fulfill({json:{result:true,data:{has_next:false,data:[{id:1,file:{hd:{gif:{url:'/powered-by-giphy.gif'}}}}]}}}));
 const asset=manifest.assets[0];
 await page.route('**/api/media/catalog?**',route=>route.fulfill({json:{items:[{id:`local:${asset.id}`,providerId:asset.id,source:'local',format:'image',title:asset.title,displayUrl:asset.url,previewUrl:asset.previewUrl,captionable:true,captionLayout:asset.captionLayout,captionMaxLength:120,attribution:asset.attribution,license:{label:asset.license,url:asset.licenseUrl}}]}}));
 await page.route('**/api/memes',route=>{const body=route.request().postDataJSON();return route.fulfill({json:{url:asset.url,templateId:asset.id,captions:body.captions,attribution:asset.attribution,license:{label:asset.license,url:asset.licenseUrl}}});});
 await page.goto('/');await page.getByPlaceholder('Your nickname').fill('Host');await page.getByRole('button',{name:/create room/i}).click();
 await expect(page.getByText('LOBBY',{exact:true})).toBeVisible();
 const code=await page.evaluate(()=>localStorage.getItem('gifbattle_last_room')!);const key=`gifbattle:room:${code}`;
 const room=JSON.parse(store.get(key)!);room.players.push({id:'guest',nickname:'Guest',score:0});store.set(key,JSON.stringify(room));
 await expect(page.getByText('PLAYERS (2/12)',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/start game/i}).click();
 await expect(page.getByLabel('Required answer mode')).toContainText('GIF answer');
 for(const name of ['Search GIFs','Make a Meme','Write Answer'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
 await page.getByPlaceholder('Search GIFs').fill('cat');await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.locator('img[loading="lazy"]').first().click();await page.getByRole('button',{name:'Submit GIF',exact:true}).click();
 await expect(page.getByLabel('Required answer mode')).toContainText('Meme answer');
 await expect(page.getByPlaceholder('Search GIFs')).toHaveCount(0);await expect(page.getByPlaceholder('Your answer or meme idea…')).toBeVisible();
 await page.getByRole('button',{name:`Select ${asset.title}`,exact:true}).click();
 await page.getByPlaceholder('Your answer or meme idea…',{exact:true}).fill('I regret everything');
 await page.getByRole('button',{name:'Submit',exact:true}).click();
 await expect(page.getByLabel('Required answer mode')).toContainText('GIF answer');
 await expect(page.getByPlaceholder('Search meme templates')).toHaveCount(0);
 await expect(page.getByPlaceholder('Your answer or meme idea…')).toHaveCount(0);
 await page.getByPlaceholder('Search GIFs').fill('dog');await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.locator('img[loading="lazy"]').first().click();await page.getByRole('button',{name:'Submit GIF',exact:true}).click();
 await expect.poll(()=>JSON.parse(store.get(key)!).submissions?.[room.host]?.length).toBe(3);
 const saved=JSON.parse(store.get(key)!);
 expect(saved.roundPlan.map((entry:any)=>entry.answerMode)).toEqual(['giphy','meme','giphy']);
 expect(saved.submissions[room.host].map((submission:any)=>submission.type)).toEqual(['media','meme','media']);
});

test('host can disable default alternating rounds and restore the two answer tabs',async({browser})=>{
 const store=new Map<string,string>();const hostContext=await browser.newContext(),guestContext=await browser.newContext();
 try{
  await installGameApiMocks(hostContext,store);await installGameApiMocks(guestContext,store);
  const host=await hostContext.newPage();await host.goto('/');await host.getByPlaceholder('Your nickname').fill('Host');await host.getByRole('button',{name:/create room/i}).click();
  await expect(host.getByText('LOBBY',{exact:true})).toBeVisible();
  const toggle=host.getByRole('checkbox',{name:'Alternate GIF and Meme rounds'});await expect(toggle).toBeChecked();
  const code=await host.evaluate(()=>localStorage.getItem('gifbattle_last_room')!);const key=`gifbattle:room:${code}`;
  const guest=await guestContext.newPage();await guest.goto('/');await guest.getByPlaceholder('Your nickname').fill('Guest');await guest.getByPlaceholder('Room code (e.g. AB12CD)').fill(code);await guest.getByRole('button',{name:/join room/i}).click();
  await expect(guest.getByText('LOBBY',{exact:true})).toBeVisible();await expect(guest.getByRole('checkbox',{name:'Alternate GIF and Meme rounds'})).toHaveCount(0);
  await expect(host.getByText('PLAYERS (2/12)',{exact:true})).toBeVisible();
  await toggle.uncheck();await expect.poll(()=>JSON.parse(store.get(key)!).alternateModes).toBe(false);
  await expect(guest.getByText('Answer format: Players choose GIF or Meme',{exact:true})).toBeVisible();
  await host.reload();await expect(host.getByRole('checkbox',{name:'Alternate GIF and Meme rounds'})).not.toBeChecked();
  await host.getByRole('button',{name:/start game/i}).click();
  await expect(host.getByRole('group',{name:'Answer mode'})).toBeVisible();
  await host.getByRole('button',{name:'Create Meme',exact:true}).click();await expect(host.getByPlaceholder('Your answer or meme idea…')).toBeVisible();
  await host.getByPlaceholder('Your answer or meme idea…').fill('My own meme answer');await host.getByRole('button',{name:'Submit',exact:true}).click();
  await expect(host.getByRole('group',{name:'Answer mode'})).toBeVisible();await expect(host.getByPlaceholder('Search GIFs')).toBeVisible();
  await expect.poll(()=>JSON.parse(store.get(key)!).submissions?.[JSON.parse(store.get(key)!).host]?.[0]?.type).toBe('text');
  expect(JSON.parse(store.get(key)!).answerModePolicy).toBe('choice-v2');
  await expect(guest.getByRole('group',{name:'Answer mode'})).toBeVisible();await expect(guest.getByRole('button',{name:'Search GIFs',exact:true})).toBeVisible();
 }finally{await hostContext.close();await guestContext.close();}
});
