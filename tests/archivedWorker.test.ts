import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialLedger, mutateWork } from '../lib/work/model';
test('worker never claims archived tasks left in its queue',()=>{
 const ledger=initialLedger();
 ledger.tasks.forEach(t=>{t.status='Archive';t.lifecycle='ARCHIVED';});
 const result=mutateWork(ledger,{command:'claim',version:0,provider:'test'},'2026-09-22T00:00:00Z','claim-id');
 assert.deepEqual(result,{run:null});
 assert.equal(ledger.runs.some(r=>r.status==='RUNNING'),false);
});
