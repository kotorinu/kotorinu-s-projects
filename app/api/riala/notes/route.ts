import { authenticated, sameOrigin } from '../../../../lib/riala-planner/security';
import { deviceAuthenticated } from '../../../../lib/server/deviceSession';
import { redisCredentials } from '../../../../lib/server/redisClient';
import { RedisJsonStore } from '../../../../lib/server/redisJsonStore';
type Draft = { title: string; material: string; previous: string; style: string; content: string };
type Notes = { version: number; draft: Draft; history: { at: string; draft: Draft }[] };
const empty: Draft = { title:'', material:'', previous:'', style:'', content:'' };
const json = (body: unknown, status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function store(){ const c=redisCredentials(); return c ? new RedisJsonStore<Notes>(c.url,c.token,'work:note-studio:v1',raw=>raw?JSON.parse(raw):{version:0,draft:{...empty},history:[]}) : null; }
export async function GET(request: Request){
  if(!authenticated(request)&&!deviceAuthenticated(request))return json({error:'端末を接続してください'},401);
  try{const s=store();return s?json(await s.read()):json({error:'保存先が未接続です'},503);}catch{return json({error:'保存先を読み込めません'},503);}
}
export async function PUT(request: Request){
  if(!authenticated(request)&&!deviceAuthenticated(request))return json({error:'端末を接続してください'},401);
  if(!sameOrigin(request))return json({error:'Origin mismatch'},403);
  try{const raw=await request.text();if(Buffer.byteLength(raw)>180000)return json({error:'入力が大きすぎます'},413);
    const body=JSON.parse(raw), draft: Draft=body.draft;
    if(!draft||!Number.isSafeInteger(body.version)||Object.keys(empty).some(k=>typeof draft[k as keyof Draft]!=='string'||draft[k as keyof Draft].length>20000))return json({error:'入力を確認してください'},400);
    const s=store();if(!s)return json({error:'保存先が未接続です'},503);
    const version=await s.transact(state=>{if(state.version!==body.version)throw new Error('conflict');state.history.push({at:new Date().toISOString(),draft:state.draft});state.history=state.history.slice(-5);state.draft=Object.fromEntries(Object.keys(empty).map(k=>[k,draft[k as keyof Draft]])) as Draft;return state.version+1;});return json({version});
  }catch(e){return json({error:e instanceof Error&&e.message==='conflict'?'別端末で更新されています。下書きを書き出して再読み込みしてください':'保存できませんでした'},e instanceof Error&&e.message==='conflict'?409:503);}
}
