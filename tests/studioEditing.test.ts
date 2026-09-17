import test from "node:test";
import assert from "node:assert/strict";
import { initialLedger, mutateWork, createTask, WorkInputError } from "../lib/work/model";
import { workCoverage } from "../lib/work/coverage";
const now="2026-09-18T01:00:00.000Z";
test("Studio task edits bind only to existing goals and support removing a binding",()=>{
  const l=initialLedger(); const t=l.tasks[0]; const goal=l.goals[0];
  mutateWork(l,{command:"updateTask",version:l.version,id:t.id,goalId:goal.id},now,"r");
  assert.equal(t.goalId,goal.id);
  assert.throws(()=>mutateWork(l,{command:"updateTask",version:l.version,id:t.id,goalId:"missing"},now,"r"),WorkInputError);
  mutateWork(l,{command:"updateTask",version:l.version,id:t.id,goalId:null},now,"r");
  assert.equal(t.goalId,null);
});
test("Studio goal edits persist the desired state and validate optional target dates",()=>{
  const l=initialLedger(); const g=l.goals[0];
  mutateWork(l,{command:"updateGoal",version:l.version,id:g.id,desiredState:"確認済みの理想",targetDate:"2026-10-01"},now,"r");
  assert.equal(g.desiredState,"確認済みの理想"); assert.equal(g.targetDate,"2026-10-01");
  assert.throws(()=>mutateWork(l,{command:"updateGoal",version:l.version,id:g.id,targetDate:"2026-02-30"},now,"r"));
  mutateWork(l,{command:"updateGoal",version:l.version,id:g.id,targetDate:null},now,"r"); assert.equal(g.targetDate,null);
});
test("Coverage obeys rescheduled deadlines, closed tasks and lifecycle overlays",()=>{
  const t=createTask({title:"実作業",deadline:"2026-09-17"},"t",now);
  const overlays={completions:{},dispositions:{},deadlineOverrides:{t:"2026-09-20"},workDateOverrides:{}};
  assert.equal(workCoverage([t],[],[],"2026-09-18",overlays).overdue.length,0);
  assert.equal(workCoverage([t],[],[],"2026-09-18",{...overlays,lifecycleOverrides:{t:{taskId:"t",lifecycle:"ARCHIVED",replacedByTaskId:null,reason:"保管",decidedOnDate:"2026-09-18",decidedAt:now}}}).pending.length,0);
});
