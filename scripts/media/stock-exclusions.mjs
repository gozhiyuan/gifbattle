import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function loadExclusions(workspace){
 try{const data=JSON.parse(await readFile(resolve(workspace,'lib/media/stock-exclusions.json'),'utf8'));if(data.version!==1||!Array.isArray(data.assets))throw new Error('Invalid stock exclusion registry');return data.assets;}
 catch(error){if(error.code==='ENOENT')return [];throw error;}
}
