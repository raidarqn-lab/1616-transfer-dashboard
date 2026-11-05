import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {allianceApprovalRoster,allianceApprovalHtml,approvalCsvCell} from '../alliance-approval-export.mjs';
import {organizationBoardMarkup,organizationGroups} from '../organization-groups.mjs';

const player=(id,extra={})=>({id,name:'Player '+id,status:'Approved',server:1607,alliance:'Origin',group:'Friends',confirmedSeat:'White',...extra});
test('alliance form contains assigned players plus the eligible unassigned pool, never other alliances or inactive applicants',()=>{
 const players=[player(1),player(2,{status:'Accepted'}),player(3),player(4,{status:'Pending'}),player(5,{status:'Declined'}),player(6,{status:'Withdrawn'}),player(7,{general:true}),player(8,{prospect:true}),player(9,{deleted:true}),player(10,{mergedInto:1}),player(11,{transferDirection:'outbound'}),player(1)];
 const rows=allianceApprovalRoster(players,{1:'WaE',3:'NvSP'},'WaE');
 assert.deepEqual(rows.map(p=>[p.id,p.pool]),[['1','assigned'],['2','available']]);
 assert.equal(rows[0].destination,'WaE');assert.equal(rows[1].destination,'Unassigned');
 assert.throws(()=>allianceApprovalRoster(players,{},'Not an alliance'));
});
test('BaDa aliases share saved placements, colours remain confirmed, and missing stats are not converted to zero',()=>{
 const rows=allianceApprovalRoster([player(1,{confirmedSeat:'Unknown',power:999,kills:0,hqLevel:null}),player(2,{profession:0,power:''})],{1:'NvEM',2:'BaDa'},'BaDa');
 assert.equal(rows.length,2);assert.ok(rows.every(p=>p.destination==='BaDa'&&p.pool==='assigned'));
 assert.equal(rows[0].seat,'Unknown');assert.equal(rows[0].hq,null);assert.equal(rows[0].kills,0);assert.equal(rows[1].power,null);assert.equal(rows[1].profession,0);
});
test('download is self-contained, escapes hostile names, and includes only review fields',()=>{
 const p=player(1,{name:'</script><script>alert(1)</script>',group:'" onfocus="bad',applicationId:'PRIVATE_CODE',contact:'PRIVATE_CONTACT',history:[{text:'PRIVATE_HISTORY'}],notes:'PRIVATE_NOTE'});
 const html=allianceApprovalHtml([p],{}, {alliance:'WaE',date:new Date('2026-11-05T06:00:00Z')});
 for(const hidden of ['PRIVATE_CODE','PRIVATE_CONTACT','PRIVATE_HISTORY','PRIVATE_NOTE'])assert.ok(!html.includes(hidden));
 assert.ok(!html.includes('<script>alert(1)</script>'));assert.match(html,/&lt;\/script&gt;/);
 assert.match(html,/Request for WaE/);assert.match(html,/Unassigned players/);assert.match(html,/Assigned to WaE/);
 assert.equal((html.match(/data-review-row data-pool=/g)||[]).length,1);
 assert.match(html,/connect-src 'none'/);assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=/);
 const script=html.match(/<script>([\s\S]*)<\/script>/)[1];assert.doesNotThrow(()=>new vm.Script(script));
 assert.match(html,/<option value="" selected>Awaiting review/);
});
test('CSV neutralizes formulas, quotes commas and newlines, and preserves multilingual values',()=>{
 for(const value of ['=HYPERLINK("bad")',' +1','-10','@cmd','\tformula'])assert.ok(approvalCsvCell(value).startsWith('"\''));
 assert.equal(approvalCsvCell('한글, name\n"note"'),'"한글, name\n""note"""');
 assert.equal(approvalCsvCell(0),'"0"');assert.equal(approvalCsvCell(null),'""');
});
test('organization offers approval export, requires saving placements, and does not expose it in Sandbox',()=>{
 const players=[player(1)],options={groups:organizationGroups(players,players,{}),state:{},alliances:['WaE'],assignments:{},limits:{},seat:()=> 'White',editable:true};
 assert.match(organizationBoardMarkup(options),/data-org-export >Alliance approval form/);
 assert.match(organizationBoardMarkup({...options,dirty:true}),/data-org-export disabled/);
 assert.doesNotMatch(organizationBoardMarkup({...options,sandbox:true}),/data-org-export/);
});
