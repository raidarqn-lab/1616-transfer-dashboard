import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function applicationDateSortValue('),html.indexOf('function sortedRoster('));
const context=vm.createContext({groupValue:(p,key)=>p[key]||'Unknown'});
vm.runInContext(source,context);
const sorted=(rows,desc,extra=[])=>[...rows].sort((a,b)=>context.compareRoster(a,b,[{key:'receivedAt',desc},...extra])).map(p=>p.name);
const rows=[{name:'New',receivedAt:'2026-10-12T08:00:00Z'},{name:'Missing',createdAt:'2020-01-01',updatedAt:'2030-01-01'},{name:'Old',receivedAt:'2026-10-10T01:00:00Z'},{name:'Invalid',receivedAt:'not a date'}];
test('application chronology works both ways and unknown dates remain last',()=>{
 assert.deepEqual(sorted(rows,false),['Old','New','Missing','Invalid']);
 assert.deepEqual(sorted(rows,true),['New','Old','Missing','Invalid']);
 assert.equal(context.applicationDateSortValue(rows[1]),null);
});
test('timestamps sort by instant, including timezone offsets and same-day times',()=>{
 const items=[{name:'Later',receivedAt:'2026-10-11T23:00:00-07:00'},{name:'Earlier',receivedAt:'2026-10-12T05:00:00Z'}];
 assert.deepEqual(sorted(items,false),['Earlier','Later']);
 assert.deepEqual(sorted(items,true),['Later','Earlier']);
});
test('ties use additional sort rules without mutating records',()=>{
 const items=[{name:'Zed',receivedAt:'2026-10-12T00:00:00Z'},{name:'Amy',receivedAt:'2026-10-12T00:00:00Z'}];
 const before=JSON.stringify(items);
 assert.deepEqual(sorted(items,true,[{key:'name',desc:false}]),['Amy','Zed']);
 assert.equal(JSON.stringify(items),before);
});
test('epoch is a valid date, while blank dates are unknown',()=>{
 assert.equal(context.applicationDateSortValue({receivedAt:'1970-01-01T00:00:00Z'}),0);
 for(const receivedAt of [undefined,null,'',' '])assert.equal(context.applicationDateSortValue({receivedAt}),null);
});
