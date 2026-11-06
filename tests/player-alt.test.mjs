import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import * as crypto from 'node:crypto';
import {resolvePlayerAlt,altBadge,setPlayerAltContext} from '../player-alt.mjs?v=1';
import {leadershipRosterHtml} from '../seat-sandbox-export.mjs';import {allianceApprovalRoster} from '../alliance-approval-export.mjs';
const players=[{id:1,name:'Main',alliance:'WaE'},{id:2,name:'Second'},{id:3,name:'Third'}],links=[{type:'alt',a:1,b:2,mainId:1},{type:'alt',a:2,b:3,mainId:1}];
test('ALT derives from main account links, normalizes IDs, excludes the main, and never infers from a name',()=>{
 assert.deepEqual(resolvePlayerAlt({...players[1],id:'2'},links,players),{isAlt:true,altOwnerName:'Main',altOwnerAlliance:'WaE',linked:true,mainId:'1'});
 assert.equal(resolvePlayerAlt({...players[0],isAlt:true},links,players).isAlt,false);
 assert.equal(resolvePlayerAlt(players[2],links,players).isAlt,true);
 assert.equal(resolvePlayerAlt({id:4,name:'My Alt'},links,players).isAlt,false);
 assert.equal(resolvePlayerAlt(players[1],[{type:'ownership',a:1,b:2,mainId:1}],players).isAlt,false);
 assert.equal(resolvePlayerAlt(players[1],[...links,{type:'alt',a:2,b:3,mainId:3}],players).isAlt,false);
});
test('manual ALT supports an owner outside the portal and the badge escapes tooltip content',()=>{
 const p={id:4,isAlt:true,altOwnerName:'Owner <img src=x>',altOwnerAlliance:'X"Y'};
 assert.equal(resolvePlayerAlt(p).altOwnerName,p.altOwnerName);const markup=altBadge(p);assert.match(markup,/>ALT<\/span>/);assert.match(markup,/Alternate account/);assert(!markup.includes('<img'));assert.match(markup,/&quot;/);assert.equal(altBadge({isAlt:'false'}),'');
});
test('linked ALT badges survive leadership and approval exports without exposing account links',()=>{
 setPlayerAltContext(()=>({links,players}));const p={...players[1],status:'Accepted',confirmedSeat:'White'};
 const report=leadershipRosterHtml([p]);assert(report.includes('player-alt-badge'));assert(!report.includes('Belongs to Main'));
 const rows=allianceApprovalRoster([p],{},'WaE');assert.equal(rows[0].isAlt,true);assert.equal(rows[0].altOwnerName,undefined);assert.equal(rows[0].accountLinks,undefined);
 setPlayerAltContext(()=>({links:[],players:[]}));
});
const source=fs.readFileSync(new URL('../backend/portal-public.ts',import.meta.url),'utf8');
const server=vm.runInNewContext(source.slice(source.indexOf('const module_1='),source.indexOf('const module_4=')).concat('\nmodule_5;'),{external_crypto:crypto,crypto:crypto.webcrypto});
const state=()=>({players:{1:{id:1,name:'Alt player',general:true,_rev:1,history:[]}},shared:{},members:{},access:{},purged:{},resetRequests:{}});
const save=(value,role='lead')=>server.saveEvents(state(),{transactionId:'alt-details-123',changes:[{kind:'players',key:'1',baseRev:1,value}]},{email:'lead@example.test'},role,'2026-11-05T12:00:00Z');
test('ALT details persist and are audited, with role, type and length protections',()=>{
 const result=save({isAlt:true,altOwnerName:'Main player',altOwnerAlliance:'WaE'});assert.equal(result[0].value.isAlt,true);assert.equal(result[0].value.altOwnerName,'Main player');assert.match(result[0].value.history[0].text,/isAlt/);
 assert.throws(()=>save({isAlt:'false'}),/ALT must/);assert.throws(()=>save({altOwnerName:'x'.repeat(101)}),/100 characters/);assert.throws(()=>save({isAlt:true},'support'),/cannot edit players/);
});

test('awaiting acceptance preserves the ALT indicator beside the player name',async()=>{
 const {awaitingAcceptanceMarkup}=await import('../awaiting-acceptance.js');
 const rendered=awaitingAcceptanceMarkup([{name:'Friends',members:[{id:9,name:'Second',isAlt:true,status:'Approved',confirmedSeat:'White'}]}]);assert(rendered.names.includes('player-alt-badge'));
});
