import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, PUT, POST } from '../app/api/riala/script/[...action]/route';
import { session, COOKIE } from '../lib/riala-planner/security';
import { latestSugiyamaMarkdown as sugiyamaMarkdown } from '../lib/sales-script/sugiyama-latest';
import { completeMarkdown } from '../lib/sales-script/seed';

test('Script API: isolated edits, fresh read, versions, restore and conflict protection',async()=>{
  const before={...process.env},originalFetch=globalThis.fetch;
  const origin='https://script.example.test',secret='test-only-operator-key'.repeat(3);
  Object.assign(process.env,{VERCEL:'1',RIALA_APP_ORIGIN:origin,RIALA_OPERATOR_SECRET:secret,RIALA_REDIS_REST_URL:'https://redis.example.test',RIALA_REDIS_REST_TOKEN:'fixture'});
  delete process.env.KV_REST_API_URL;delete process.env.KV_REST_API_TOKEN;
  const data=new Map<string,string>();
  globalThis.fetch=async(url,init)=>{assert.equal(String(url),'https://redis.example.test');const a=JSON.parse(String(init?.body));if(a[0].toLowerCase()==='get')return Response.json({result:data.get(a[1])??null});assert.equal(a[0].toLowerCase(),'eval');if((data.get(a[3])??'')!==a[4])return Response.json({result:0});data.set(a[3],a[5]);return Response.json({result:1});};
  const req=(path:string,method='GET',body?:unknown,edition='sugiyama')=>new Request(origin+'/api/riala/script/'+path+'?edition='+edition,{method,headers:{cookie:COOKIE+'='+session(secret),origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  try{
    const initial=await(await GET(req('document'))).json();assert.equal(initial.content,sugiyamaMarkdown);assert.equal(initial.canEdit,true);
    const edited=sugiyamaMarkdown+'\n編集保存の検証';
    assert.equal((await PUT(req('document','PUT',{content:edited,revision:0,note:'手動保存'}))).status,200);
    assert.equal((await(await GET(req('document'))).json()).content,edited);
    assert.equal((await(await GET(req('document','GET',undefined,'mogi'))).json()).content,completeMarkdown);
    assert.equal(data.size,1);assert.ok(data.has('sales-script:sugiyama:2026-09-25'));
    assert.equal((await PUT(req('document','PUT',{content:edited,revision:0}))).status,409);
    const history=await(await GET(req('versions'))).json();assert.equal(history.versions.length,2);
    assert.equal((await POST(req('restore/0','POST',{revision:1}))).status,200);
    assert.equal((await(await GET(req('document'))).json()).content,sugiyamaMarkdown);
    assert.equal((await PUT(new Request(origin+'/api/riala/script/document?edition=sugiyama',{method:'PUT'}))).status,401);
  }finally{globalThis.fetch=originalFetch;for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);}
});
