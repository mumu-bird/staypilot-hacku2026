import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultWorkflowPolicy,policySchema} from '../shared/workflow-policy.ts';
test('policy rejects contradictory spending and rating boundaries without changing authority',()=>{
 assert.equal(policySchema.safeParse({...defaultWorkflowPolicy,idealBudgetCents:60001}).success,false);
 assert.equal(policySchema.safeParse({...defaultWorkflowPolicy,minimumRating:4.6,preferredRating:4.5}).success,false);
 assert.equal(policySchema.safeParse({...defaultWorkflowPolicy,minimumRating:4,preferredRating:4.5}).success,true);
 assert.equal(policySchema.safeParse({...defaultWorkflowPolicy,minimumRating:4.6}).success,true);
 const old=policySchema.parse(defaultWorkflowPolicy);
 assert.equal(old.budgetCents,60000);
 assert.equal(old.allowLowerRating,undefined);
});
test('required facilities reject blank entries and excessive lists, preserving explicit requirements',()=>{
 assert.equal(policySchema.safeParse({...defaultWorkflowPolicy,requiredAmenities:['   ']}).success,false);
 assert.equal(policySchema.safeParse({...defaultWorkflowPolicy,requiredAmenities:Array(11).fill('电梯')}).success,false);
 assert.deepEqual(policySchema.parse({...defaultWorkflowPolicy,requiredAmenities:[' 电梯 ']}).requiredAmenities,['电梯']);
});
