import {createHash} from 'node:crypto';
export type CatalogCursor={v:1;r:string;o:number;s:string;f:string};
export function queryIdentity(input:{query:string;category:string;captionable:boolean;pageSize:number}){return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0,24);}
export function encodeCatalogCursor(cursor:CatalogCursor){return Buffer.from(JSON.stringify(cursor)).toString('base64url');}
export function decodeCatalogCursor(value:string):CatalogCursor{
 if(value.length>600||!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid cursor');
 const c=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
 if(c.v!==1||!/^[a-f0-9]{64}$/.test(c.r)||!Number.isInteger(c.o)||c.o<0||c.o>1000000||typeof c.s!=='string'||c.s.length>80||!/^[a-f0-9]{24}$/.test(c.f))throw Error('Invalid cursor');return c;
}
