// Test-only process preload. Production SDK validation and routes are unchanged.
if(process.env.WORK_OS_UI_TEST_FIXTURE!=="1")throw Error("UI fixture requires its isolated launcher");
const values=new Map([["work:core:v1",process.env.WORK_OS_UI_TEST_LEDGER]]);
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==="string"?input:input.url ?? String(input));
  if(url.hostname==="redis-fixture.invalid") {
    const args=JSON.parse(String(init?.body));let result;
    if(String(args[0]).toLowerCase()==="get")result=values.get(args[1])??null;
    else if(String(args[0]).toLowerCase()==="eval") {
      result=(values.get(args[3])??"")===args[4]?1:0;if(result)values.set(args[3],args[5]);
    } else throw Error("Unsupported fixture command");
    return Response.json({result});
  }
  if(!["127.0.0.1","localhost"].includes(url.hostname))throw Error("External network disabled in isolated UI test");
  return nativeFetch(input,init);
};
