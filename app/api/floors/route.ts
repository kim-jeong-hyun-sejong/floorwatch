import { env } from 'cloudflare:workers';
import { FLOORS, validRoom, normalizeNames } from '../../signal';
export const runtime = 'edge';
const reply = (data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function ready() {
 if (!env.DB) throw Error('missing_db_binding');
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS floor_signals_v2 (room TEXT NOT NULL, floor INTEGER NOT NULL, count INTEGER NOT NULL, names TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL, PRIMARY KEY(room,floor))").run();
}
export async function GET(request:Request) {
 const room=new URL(request.url).searchParams.get('room');
 if(!validRoom(room))return reply({error:'invalid_room'},400);
 if(!env.DB)return reply({error:'missing_db_binding'},503);
 try {
 await ready();
 const result=await env.DB.prepare('SELECT floor,count,names,updated_at FROM floor_signals_v2 WHERE room=?').bind(room).all<{floor:number;count:number;names:string;updated_at:number}>();
 const now=Date.now();
 return reply({floors:FLOORS.map(floor=>{
 const r=result.results.find(r=>r.floor===floor);
 const fresh=!!r&&now-r.updated_at<=12000&&now>=r.updated_at;
 return {floor,count:fresh?r.count:0,names:fresh?normalizeNames(JSON.parse(r.names)):[],updatedAt:r?.updated_at??null,state:!fresh?'offline':r.count>0?'active':'empty'};
 })});
 }catch{return reply({error:'database_error'},503);}
}
export async function POST(request:Request) {
 if(!env.DB)return reply({error:'missing_db_binding'},503);
 try{
 const text=await request.text();
 if(new TextEncoder().encode(text).length>4096)return reply({error:'too_large'},413);
 let d;try{d=JSON.parse(text);}catch{return reply({error:'invalid_json'},400);}
 if(!d||!validRoom(d.room)||!Number.isInteger(d.floor)||!FLOORS.includes(d.floor)||!Number.isInteger(d.count)||d.count<0||d.count>20)return reply({error:'invalid_signal'},400);
 const names=normalizeNames(d.names).slice(0,d.count);
 await ready();
 await env.DB.prepare('INSERT INTO floor_signals_v2(room,floor,count,names,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(room,floor) DO UPDATE SET count=excluded.count,names=excluded.names,updated_at=excluded.updated_at').bind(d.room,d.floor,d.count,JSON.stringify(names),Date.now()).run();
 return reply({ok:true});
 }catch{return reply({error:'database_error'},503);}
}
