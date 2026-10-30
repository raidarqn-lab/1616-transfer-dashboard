import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
const c=vm.createContext({});
for(const [a,b] of [['function preferredAllianceValue(', 'function groupTotals('],['function parseRuleNumber(', 'const filterTrees='],['function orderedColumns(', 'function installColumnOrder(']])vm.runInContext(html.slice(html.indexOf(a),html.indexOf(b)),c);
test('alliance tags are consistent across submitted formats; a cleared preference stays empty',()=>{
 for(const value of ['[NvSP] Nova Sapphire','nvsp','NvSP'])assert.equal(c.preferredAllianceValue({preference:value}),'NvSP');
 assert.equal(c.preferredAllianceValue({preference:'',rawApplication:{preferred1616Alliance:'NvEM'}}),'Unknown');
 assert.equal(c.preferredAllianceValue({rawApplication:{preferred1616Alliance:'[WaE] WorstAllianceEver'}}),'WaE');
 assert.equal(c.preferredAllianceValue({preference:'No preference'}),'No preference');
});
test('preferred-alliance filters use requested preference independently of destination or current alliance',()=>{
 const p={preference:'[NvSP] Nova Sapphire',alliance:'PWNA',destinationAlliance:'WaE'};
 assert.equal(c.testPlayerRule(p,{field:'preference',op:'eq',value:'NvSP'}),true);
 assert.equal(c.testPlayerRule(p,{field:'preference',op:'eq',value:'WaE'}),false);
 assert.equal(c.testPlayerRule({preference:''},{field:'preference',op:'unknown'}),true);
 assert.equal(c.testPlayerRule(p,{field:'preference',op:'known'}),true);
});
test('old layouts gain preferred alliance beside team and retain pinned edit; custom new layouts survive',()=>{
 const old=[0,14,1,2,15,3,16,4,5,6,7,8,9,10,11,12,13,17];
 const fresh=Array.from(c.orderedColumns(old,19));assert.equal(fresh[fresh.indexOf(3)+1],17);assert.equal(fresh.at(-1),18);assert.equal(new Set(fresh).size,19);
 assert.deepEqual(fresh.filter(x=>x!==17&&x!==18),old.filter(x=>x!==17));
 const custom=[17,...fresh.filter(x=>x!==17)];assert.deepEqual(Array.from(c.orderedColumns(custom,19)),custom);
});
