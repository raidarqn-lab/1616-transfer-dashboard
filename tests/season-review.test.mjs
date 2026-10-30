import test from 'node:test';import assert from 'node:assert/strict';
import {reviewTotals,selectReviewRows,reviewCsv} from '../season-review-core.mjs';
const reviewers=Array.from({length:12},(_,i)=>({id:String(i)}));
const data={reviewers,actorId:'0',players:[{playerKey:'a',name:'Alpha',uid:'001'},{playerKey:'b',name:'Beta',uid:'002'}],votes:[{playerKey:'a',reviewerId:'0',vote:'Keep',comment:'Good'},{playerKey:'a',reviewerId:'1',vote:'Cut'},{playerKey:'b',reviewerId:'1',vote:'Cut'},{playerKey:'a',reviewerId:'outside',vote:'Keep'}]};
test('totals use exactly 12 assigned reviewers and ignore outsiders',()=>{assert.deepEqual(reviewTotals('a',data.votes,reviewers),{keep:1,cut:1,missing:10});});
test('blank comment-only vote is missing; a changed vote counts once',()=>{const votes=[{playerKey:'a',reviewerId:'0',vote:null,comment:'Note'}];assert.equal(reviewTotals('a',votes,reviewers).missing,12);votes[0].vote='Keep';assert.equal(reviewTotals('a',votes,reviewers).keep,1);votes[0].vote='Cut';assert.deepEqual(reviewTotals('a',votes,reviewers),{keep:0,cut:1,missing:11});});
test('filters support split votes, reviewer selections, missing votes and UID search',()=>{assert.deepEqual(selectReviewRows(data,{filter:'split'}).map(p=>p.name),['Alpha']);assert.deepEqual(selectReviewRows(data,{filter:'mine-missing'}).map(p=>p.name),['Beta']);assert.equal(selectReviewRows(data,{filter:'reviewer-cut',reviewerId:'1'}).length,2);assert.equal(selectReviewRows(data,{query:'002'})[0].name,'Beta');assert.equal(selectReviewRows(data,{sort:'missing'})[0].name,'Beta');});
test('CSV preserves comments and text UIDs and neutralizes formula injection',()=>{const csv=reviewCsv(['UID','Comment'],[['001','=HYPERLINK("bad")'],['002','Line 1\nLine 2, "quote"']]);assert.ok(csv.includes('"001"'));assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));assert.ok(csv.includes('Line 1\nLine 2, ""quote""'));});

test('season stats join by player key, ignore other seasons, and preserve missing values',async()=>{
 const {attachReviewStats}=await import('../season-review-core.mjs');
 const players=attachReviewStats(data.players,[{playerKey:'a',season:3,profile:{kills:999}},{playerKey:'b',name:'Alpha',season:4,profile:{kills:0},scores:{conquest:120},rosterDate:'2026-10-28'}]);
 assert.equal(players[0].profile.kills,undefined);assert.equal(players[1].profile.kills,0);assert.equal(players[1].scores.conquest,120);
 assert.equal(selectReviewRows({...data,players},{sort:'kills'})[0].playerKey,'b');assert.equal(selectReviewRows({...data,players},{sort:'conquest'})[0].playerKey,'b');
});
