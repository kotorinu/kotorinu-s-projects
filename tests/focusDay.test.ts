import test from "node:test";
import assert from "node:assert/strict";
import { focusDay } from "../lib/focusDay";
import { createTask, initialLedger, mutateWork, WorkInputError } from "../lib/work/model";
import { sessionCompletion } from "../lib/sessionCompletion";
import { startWorkOn, endWorkOn, type SessionLedger } from "../lib/workSession";
import type { TaskWorkSession } from "../lib/types";
import { closedExecutionTaskIds, executionReadDecision } from "../lib/work/execution";
const now="2026-09-18T01:00:00Z";
const overlays={completions:{},dispositions:{},deadlineOverrides:{},workDateOverrides:{}};
test("Today separates scheduled work from deadlines and honors rescheduling",()=>{
  const planned={...createTask({title:"予定",deadline:"2026-09-18"},"planned",now),workDate:"2026-09-18"};
  const due=createTask({title:"期限",deadline:"2026-09-18"},"due",now);
  const result=focusDay([planned,due],[],"2026-09-18","10:00",{...overlays,workDateOverrides:{planned:"2026-09-19"}},null);
  assert.equal(result.scheduled.length,0); assert.equal(result.due.length,2); assert.equal(result.focus?.id,"due");
});
test("Today never suggests blocked or archived work but retains active work across midnight",()=>{
  const t={...createTask({title:"本作業"},"t",now),workDate:"2026-09-18"};
  assert.equal(focusDay([t],[],"2026-09-19","00:10",overlays,"t").active?.id,"t");
  const blocked={...overlays,dispositions:{t:{taskId:"t",disposition:"BLOCKED" as const,decidedOnDate:"2026-09-18",decidedAt:now,note:null}}};
  assert.equal(focusDay([t],[],"2026-09-18","10:00",blocked,null).focus,null);
  assert.equal(focusDay([{...t,lifecycle:"ARCHIVED"}],[],"2026-09-18","10:00",overlays,null).focus,null);
});
test("Completion sums actual sessions and excludes hours spent paused",()=>{
  let l:SessionLedger={sessions:[],actualMinutes:new Map(),startedTaskId:null};
  l=startWorkOn(l,"t","2026-09-18T01:00:00Z");l=endWorkOn(l,"t","STOPPED","2026-09-18T01:10:00Z");
  l=startWorkOn(l,"t","2026-09-18T05:00:00Z");
  const t=createTask({title:"計測",estimateMinutes:20},"t",now);
  const record=sessionCompletion(t,{date:"2026-09-18",nowIso:"2026-09-18T05:05:00Z",sessions:l.sessions,actual:l.actualMinutes,deadlineOverrides:{},metDefinitionOfDone:true});
  assert.equal(record.actualMinutes,15);assert.equal(record.varianceMinutes,-5);
});
test("Completion keeps unmeasured time null and a real entered zero intact",()=>{
  const t=createTask({title:"計測"},"t",now);
  const args={date:"2026-09-18",nowIso:now,sessions:[] as TaskWorkSession[],actual:new Map<string,number>(),deadlineOverrides:{},metDefinitionOfDone:false};
  assert.equal(sessionCompletion(t,args).actualMinutes,null);
  assert.equal(sessionCompletion(t,{...args,actual:new Map([["t",0]])}).actualMinutes,0);
});
test("AI enqueue repairs a missing hybrid queue without duplicate or completed execution",()=>{
  const l=initialLedger();l.tasks=[];l.runs=[];
  const t=createTask({title:"下準備",description:"確認済み資料を整理",aiCapability:"HYBRID",definitionOfDone:["比較表を残す"]},"t",now);l.tasks.push(t);
  mutateWork(l,{command:"enqueue",version:l.version,id:"t"},now,"r");
  mutateWork(l,{command:"enqueue",version:l.version,id:"t"},now,"other");assert.equal(l.runs.length,1);
  assert.throws(()=>mutateWork(l,{command:"enqueue",version:l.version,id:"t"},now,"closed",["t"]),WorkInputError);
});
test("Worker excludes completion, archive, merge and dropped execution overlays",()=>{
  const ids=closedExecutionTaskIds({completions:{done:{}},dispositions:{drop:{disposition:"DROPPED"},wait:{disposition:"BLOCKED"}},lifecycleOverrides:{archived:{lifecycle:"ARCHIVED"},merged:{lifecycle:"MERGED"},active:{lifecycle:"ACTIVE"}}});
  assert.deepEqual(ids.sort(),["archived","done","drop","merged"]);
});
test("Reload keeps unacknowledged device work and never overwrites a concurrent central change",()=>{
  const ack={version:4,serialized:"old"};
  assert.equal(executionReadDecision("completed",ack,4),"DEVICE");
  assert.equal(executionReadDecision("completed",ack,5),"CONFLICT");
  assert.equal(executionReadDecision("old",ack,5),"CENTRAL");
  assert.equal(executionReadDecision("new device",null,5),"CENTRAL");
});
