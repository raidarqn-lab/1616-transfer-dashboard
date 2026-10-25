import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sandboxGroups,sandboxForecast,sandboxExceptionState,applySandboxCommand,sandboxSeat} from '../seat-sandbox-core.mjs';
const identity={email:'lead@example.test'},other={email:'reviewer@example.test'};
const capacities={Gold:1,Purple:2,Blue:3,White:3};
const fixture=()=>[
 {id:1,name:'Accepted',status:'Approved',group:'North',power:200,confirmedSeat:'Blue'},
 {id:2,name:'North member',status:'Pending',group:'Nórth',power:180},
 {id:3,name:'Solo',status:'Pending',group:'Solo',power:129},
 {id:4,name:'Harbor A',status:'Pending',group:'Harbor',power:230},
 {id:5,name:'Harbor B',status:'Interested',prospect:true,group:'Harbor',power:228},
 {id:6,name:'Withdrawn',status:'Withdrawn',group:'',power:200},
 {id:7,name:'Deleted',status:'Approved',deleted:true,power:250},
 {id:8,name:'Departed',status:'Departed',transferDirection:'outbound',power:260}
];
const run=(previous,command,players=fixture(),who=identity,role='lead')=>applySandboxCommand({previous,command,players,identity:who,role,now:'2026-10-22T10:00:00Z'}).data;
const create=()=>run(null,{op:'create',id:'scenario-123',name:'Trial'});
const command=(op,extra={})=>({op,id:'scenario-123',...extra});
function group(data,players=fixture()){return sandboxGroups(players,data.scenarios[0]).find(g=>g.name==='Harbor');}
function include(data,players=fixture()){const g=group(data,players);return run(data,command('select',{groupKey:g.key,memberIds:g.memberIds,include:true}),players);}
function request(data){const g=group(data);return run(data,command('request',{groupKey:g.key,memberIds:g.memberIds,playerId:'4',requestId:'request-123',reason:'Different transfer season'}));}

test('accepted baseline is automatic, groups expand across categories, unknowns do not look like free seats',()=>{
 const players=fixture();players.push({id:9,name:'Unknown',status:'Approved',power:null});
 const f=sandboxForecast(players,capacities,create().scenarios[0]);
 assert.equal(f.accepted,2);assert.equal(f.counts.Blue.accepted,1);assert.equal(f.counts.Purple.tentative,0);assert.equal(f.counts.Unknown.accepted,1);
 assert.deepEqual(f.members.map(p=>p.id).sort(),[1,9]);
 assert.equal(f.groups.find(g=>g.name==='Harbor').members.length,2);assert(!f.groups.some(g=>g.members.some(p=>[6,7,8].includes(p.id))));
 assert.equal(sandboxSeat({...players[1],confirmedSeat:'White'}),'Purple');
});
test('whole groups count once; pending exception counts until independent approval, and restore reunites group',()=>{
 const original=fixture(),before=structuredClone(original);let d=include(create());
 let f=sandboxForecast(original,capacities,d.scenarios[0]);assert.equal(f.counts.Gold.tentative,1);assert.equal(f.counts.Purple.tentative,1);
 d=request(d);assert.equal(sandboxForecast(original,capacities,d.scenarios[0]).counts.Gold.tentative,1);
 assert.throws(()=>run(d,command('review',{requestId:'request-123',decision:'approved',reviewNote:''})),/different administrator/);
 assert.throws(()=>run(d,command('review',{requestId:'request-123',decision:'approved',reviewNote:''}),original,identity,'admin'),/different administrator/);
 d=run(d,command('review',{requestId:'request-123',decision:'approved',reviewNote:'Reviewed'}),original,other);
 f=sandboxForecast(original,capacities,d.scenarios[0]);assert.equal(f.counts.Gold.tentative,0);assert.equal(f.counts.Purple.tentative,1);
 assert.equal(d.scenarios[0].exceptions[0].reviewedBy,other.email);assert.equal(d.scenarios[0].exceptions[0].requestedBy,identity.email);
 d=run(d,command('restore',{requestId:'request-123'}));assert.equal(sandboxForecast(original,capacities,d.scenarios[0]).counts.Gold.tentative,1);
 assert.deepEqual(original,before);
});
test('new live acceptance overrides an old exception, reanchors the group and is never double-counted',()=>{
 let d=request(include(create()));d=run(d,command('review',{requestId:'request-123',decision:'approved',reviewNote:''}),fixture(),other);
 const players=fixture();players[3].status='Approved';players[3].confirmedSeat='Gold';
 const f=sandboxForecast(players,capacities,d.scenarios[0]);assert.equal(f.counts.Gold.accepted,1);assert.equal(f.counts.Gold.tentative,0);assert.equal(f.accepted,2);
 assert.equal(sandboxExceptionState(d.scenarios[0].exceptions[0],group(d,players)),'stale');
 const g=group(d,players);d=run(d,command('select',{groupKey:g.key,memberIds:g.memberIds,include:false}),players);
 const after=sandboxForecast(players,capacities,d.scenarios[0]);assert.equal(after.counts.Gold.accepted,1);assert.equal(after.counts.Purple.tentative,0);
});
test('partially accepted groups can add and remove remaining members without touching formal approvals',()=>{
 const players=fixture(),before=structuredClone(players);let d=create();
 const north=sandboxGroups(players,d.scenarios[0]).find(g=>g.key==='group:north');
 assert.equal(north.anchored,true);assert.equal(north.selected,false);
 const toggle=include=>command('select',{groupKey:north.key,memberIds:north.memberIds,include});
 d=run(d,toggle(true),players);let f=sandboxForecast(players,capacities,d.scenarios[0]);
 assert.equal(f.counts.Blue.accepted,1);assert.equal(f.counts.Purple.tentative,1);assert.equal(f.members.length,2);
 d=run(d,toggle(true),players);assert.equal(sandboxForecast(players,capacities,d.scenarios[0]).members.length,2);
 d=run(d,toggle(false),players);f=sandboxForecast(players,capacities,d.scenarios[0]);
 assert.deepEqual(f.members.map(p=>p.id),[1]);assert.equal(f.counts.Purple.tentative,0);assert.equal(f.counts.Blue.accepted,1);
 assert.deepEqual(players,before);
});
test('stale membership invalidates approval and rejects actions based on old roster; renamed groups follow selected players',()=>{
 let d=request(include(create()));d=run(d,command('review',{requestId:'request-123',decision:'approved',reviewNote:''}),fixture(),other);
 const players=fixture();players.push({id:10,name:'New member',group:'Harbor',status:'Pending',power:150});
 const f=sandboxForecast(players,capacities,d.scenarios[0]);assert.equal(f.counts.Gold.tentative,1);assert.equal(f.counts.Blue.tentative,1);
 const old=group(d);assert.throws(()=>run(d,command('select',{groupKey:old.key,memberIds:old.memberIds,include:false}),players),/membership changed/);
 players.filter(p=>p.group==='Harbor').forEach(p=>p.group='Renamed');
 assert(sandboxGroups(players,d.scenarios[0]).find(g=>g.name==='Renamed').selected);
});
test('rejection, unknown THP, over-capacity and independent scenarios preserve live state',()=>{
 let d=request(include(create()));d=run(d,command('review',{requestId:'request-123',decision:'rejected',reviewNote:'Keep together'}),fixture(),other);
 assert.equal(sandboxForecast(fixture(),{...capacities,Gold:0},d.scenarios[0]).counts.Gold.remaining,-1);
 d=run(d,{op:'create',id:'scenario-456',name:'Alternative'});assert.equal(sandboxForecast(fixture(),capacities,d.scenarios[1]).counts.Gold.tentative,0);
 const players=fixture();players[0].confirmedSeat='';players[0].power=null;
 assert.equal(sandboxForecast(players,{},d.scenarios[1]).counts.Unknown.accepted,1);
 assert.equal(sandboxForecast(players,{},d.scenarios[1]).counts.Gold.remaining,null);
});
test('support, forged approvals, accepted removals, duplicate pending requests and bad payloads are denied',()=>{
 let d=create();const g=sandboxGroups(fixture(),d.scenarios[0]).find(g=>g.anchored);
 assert.throws(()=>run(d,command('request',{groupKey:g.key,memberIds:g.memberIds,playerId:'1',requestId:'request-123',reason:'Remove'})),/Only unaccepted/);
 for(const cmd of [command('create',{name:'Trial',status:'Approved'}),command('review',{requestId:'missing-id',decision:'approved',reviewNote:''}),command('rename',{name:' '}),command('select',{groupKey:'group:harbor',memberIds:['4'],include:true})])assert.throws(()=>run(d,cmd));
 assert.throws(()=>run(d,command('rename',{name:'Trial'}),fixture(),identity,'support'),/Admin or lead/);
 d=request(include(d));assert.throws(()=>request(d),/identifier|already has/);
 assert.equal(d.scenarios[0].exceptions[0].status,'pending');
});
test('individual placement moves only the named member, preserves approvals, and does not expand on membership changes',()=>{
 const players=fixture(),before=structuredClone(players);let d=create();
 const move=(playerId,include)=>command('member',{playerId:String(playerId),include});
 d=run(d,move(4,true),players);
 assert.equal(d.scenarios[0].selectionMode,'individual');
 assert.deepEqual(sandboxForecast(players,capacities,d.scenarios[0]).members.map(p=>p.id).sort(),[1,4]);
 d=run(d,move(4,true),players);assert.equal(d.scenarios[0].selectedIds.length,1);
 const changed=[...players,{id:20,name:'New friend',group:'Harbor',status:'Pending',power:180}];
 assert.deepEqual(sandboxForecast(changed,capacities,d.scenarios[0]).members.map(p=>p.id).sort(),[1,4]);
 d=run(d,move(4,false),players);assert.deepEqual(sandboxForecast(players,capacities,d.scenarios[0]).members.map(p=>p.id),[1]);
 assert.throws(()=>run(d,move(1,false),players),/always stay included/);
 assert.throws(()=>run(d,move(999,true),players),/no longer available/);
 assert.throws(()=>run(d,move(4,true),players,identity,'support'),/Admin or lead/);
 assert.deepEqual(players,before);
});
test('first individual move preserves legacy selections and approved exclusions without requiring new exception approval',()=>{
 let d=request(include(create()));d=run(d,command('review',{requestId:'request-123',decision:'approved',reviewNote:''}),fixture(),other);
 const before=sandboxForecast(fixture(),capacities,d.scenarios[0]).members.map(p=>p.id);
 d=run(d,command('member',{playerId:'2',include:true}));
 assert.deepEqual(sandboxForecast(fixture(),capacities,d.scenarios[0]).members.map(p=>p.id).sort(),[...before,2].sort());
 d=run(d,command('member',{playerId:'4',include:true}));
 assert(sandboxForecast(fixture(),capacities,d.scenarios[0]).members.some(p=>p.id===4));
 assert.equal(d.scenarios[0].exceptions[0].status,'approved');
});
