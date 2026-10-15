import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {getCatalog} from '@/lib/media/catalog-server';
import {searchCatalog} from '@/lib/media/catalog-search';
import {CatalogRevisionExpired} from '@/lib/media/catalog-loader';
import {decodeCatalogCursor,encodeCatalogCursor,queryIdentity} from '@/lib/media/catalog-cursor';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const p=request.nextUrl.searchParams,headers={'Cache-Control':'private, no-store'};
 let input,cursor,seed:string;
 try{
  input={query:p.get('q')||'',category:p.get('category')||'',captionable:p.get('captionable')==='true',pageSize:Number(p.get('limit')||24)};
  const raw=p.get('cursor');cursor=raw&&!/^\d+$/.test(raw)?decodeCatalogCursor(raw):null;
  seed=p.get('seed')||cursor?.s||randomUUID();if(seed.length>80)throw Error();
  if(cursor&&(cursor.f!==queryIdentity(input)||cursor.s!==seed))throw Error();
  // Reject invalid arguments before reading Redis or downloading a snapshot.
  searchCatalog({version:1,assets:[]},{...input,seed,cursor:cursor?String(cursor.o):raw||undefined});
 }catch{return NextResponse.json({error:'invalid_catalog_search'},{status:400,headers});}
 try{
  const {catalog,revision}=await getCatalog({revision:cursor?.r});
  const result=searchCatalog(catalog,{...input,seed,cursor:cursor?String(cursor.o):p.get('cursor')||undefined});
  return NextResponse.json({...result,revision,nextCursor:result.nextCursor?encodeCatalogCursor({v:1,r:revision,o:Number(result.nextCursor),s:seed,f:queryIdentity(input)}):undefined},{headers});
 }catch(error){return NextResponse.json({error:error instanceof CatalogRevisionExpired?'catalog_changed':'catalog_unavailable'},{status:error instanceof CatalogRevisionExpired?409:503,headers});}
}
