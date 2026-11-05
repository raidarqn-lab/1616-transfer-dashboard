import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allianceKey,allianceTag,allianceLabel} from '../alliance-names.mjs';
import {organizationGroups,organizationBoardMarkup} from '../organization-groups.mjs';
import {leadershipRosterHtml} from '../seat-sandbox-export.mjs';
test('renamed alliance retains its saved identity for legacy and new names',()=>{
 for(const name of ['NvEM','nvem','BaDa','BadaBingBadaBoom','[NvEM] Nova Emerald','Nova Emarald','[BaDa] BadaBingBadaBoom']){
  assert.equal(allianceKey(name),'NvEM');assert.equal(allianceTag(name),'BaDa');
 }
 assert.equal(allianceLabel('[NvEM] Nova Emerald'),'[BaDa] BadaBingBadaBoom');
 assert.equal(allianceTag('WaE'),'WaE');assert.equal(allianceTag('<other>'),'<other>');
});
test('saved Emerald placements and limits render as BaDa without mutation',()=>{
 const players=[{id:1,name:'Placed',group:'Team',status:'Accepted',confirmedSeat:'White'}],assignments={1:'NvEM'},limits={NvEM:15};
 const before=JSON.stringify({players,assignments,limits});
 const html=organizationBoardMarkup({groups:organizationGroups(players,players,assignments),state:{player:1},alliances:['NvEM'],assignments,limits,seat:p=>p.confirmedSeat,editable:true});
 assert.match(html,/<option value="NvEM" selected>BaDa<\/option>/);
 assert.match(html,/aria-label="BaDa alliance"/);assert.match(html,/1 player \/ 15/);
 assert.match(html,/Incoming limit for BaDa/);assert.equal(JSON.stringify({players,assignments,limits}),before);
 const report=leadershipRosterHtml([{...players[0],destinationAlliance:'NvEM'}],{live:true});assert.match(report,/data-destination="BaDa"/);
});
