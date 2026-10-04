import {test} from 'node:test';
import assert from 'node:assert/strict';
import {membershipLabels} from '../player-membership.js';
const events=[{type:'removed',date:'2026-10-03',alliance:'NvSP'},{type:'readmitted',date:'2026-10-04',alliance:'NvSP'}];
test('selected week includes removal and Sunday readmission',()=>assert.deepEqual(membershipLabels(events,'2026-09-28'),['Removed NvSP · Oct 3','Readmitted NvSP · Oct 4']));
test('next week does not repeat old membership changes',()=>assert.deepEqual(membershipLabels(events,'2026-10-05'),[]));
test('profile history keeps dates including year',()=>assert.deepEqual(membershipLabels(events),['Removed NvSP · Oct 3, 2026','Readmitted NvSP · Oct 4, 2026']));
test('missing history is safe',()=>assert.deepEqual(membershipLabels(null),[]));
