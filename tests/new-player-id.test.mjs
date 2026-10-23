import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
const source=html.match(/function nextTeamPlayerId\(records,now=Date\.now\(\)\)\{[^\n]+\}/)[0];
const allocate=vm.runInNewContext('('+source+')');
test('legacy and missing IDs cannot poison a new player ID',()=>{
  const rows=[{id:undefined},{id:'legacy-contact'},{id:NaN},{id:Number.MAX_SAFE_INTEGER},{id:Infinity}];
  assert.equal(allocate(rows,1792720000000),1792720000000);
});
test('avoids numeric and string ID collisions without changing existing records',()=>{
  const rows=[{id:1792720000000},{id:'1792720000001'}];
  const before=JSON.stringify(rows);
  assert.equal(allocate(rows,1792720000000),1792720000002);
  assert.equal(JSON.stringify(rows),before);
});
test('handles the safe-integer boundary and invalid clocks',()=>{
  assert.equal(allocate([{id:Number.MAX_SAFE_INTEGER}],Number.MAX_SAFE_INTEGER),20000);
  assert.equal(allocate([{id:20000}],NaN),20001);
});
test('new contact and prospect flows share the allocator',()=>{
  assert.equal((html.match(/nextTeamPlayerId\(players\)/g)||[]).length,3);
  assert.ok(!html.includes('Math.max(...players.map(p=>p.id))+1'));
  assert.ok(!html.includes('Math.max(20000,...players.map(p=>p.id))+1'));
});
