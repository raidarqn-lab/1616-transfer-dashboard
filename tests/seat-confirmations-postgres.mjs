const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite(),read=path=>fs.readFile(new URL('../'+path,import.meta.url),'utf8');
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema nova_evidence_private;create schema transfer_private;create schema extensions;
 create table transfer_private.portal_records(kind text,key text,revision bigint,payload jsonb,primary key(kind,key));
 create table transfer_private.portal_control(singleton boolean primary key,admin_email text,revision bigint);
 create table transfer_private.portal_transactions(id text primary key,actor text,events jsonb,revision bigint);
 create table nova_evidence_private.hub_staff(email text primary key,role text,alliances jsonb,status text,accounts_manage boolean,updated_by text);
 create table nova_evidence_private.admin_identities(email text primary key,id uuid,display_name text,player_key text,revision bigint,updated_at timestamptz,updated_by text);
 create table nova_evidence_private.member_links(account_id uuid primary key,player_key text,active boolean,historical_until timestamptz);
 create table nova_evidence_private.hub_audit(actor_email text,action text,subject text,detail jsonb);
 insert into nova_evidence_private.hub_staff values('owner@test.invalid','master','[]','active',true,'test');
 insert into transfer_private.portal_control values(true,'owner@test.invalid',10);
 create function extensions.digest(t text,algorithm text) returns bytea language sql as $$select sha256(convert_to(t,'UTF8'))$$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'hex')$$;`);
 await db.exec(await read('deployment/manual-accounts/accounts.sql'));await db.exec(await read('backend/applicant-messenger.sql'));
 await db.exec(await read('backend/seat-confirmations.sql'));await db.exec(await read('backend/seat-confirmations.sql'));
 await db.exec(await read('backend/seat-confirmations-transfer-lead.sql'));await db.exec(await read('backend/seat-confirmations-transfer-lead.sql'));
 const call=async(action,args)=>(await db.query('select public.nova_manual_accounts($1,$2::jsonb) as data',[action,JSON.stringify(args)])).rows[0].data;
 const account=await call('hub-login-save',{staffEmail:'owner@test.invalid',accountType:'applicant_messenger',displayName:'Helper name',username:'fixture_helper',hash:'a'.repeat(64),salt:'b'.repeat(64),reason:'Transactional verification'});
 const login=await call('login-finish',{accountId:account.id,version:1});const token=login.token,by='manual:'+account.id;
 const base={name:'Fixture applicant',server:1626,alliance:'RiZZ',group:'Glass House 1',status:'Pending',notes:'PRIVATE',history:[{text:'PRIVATE HISTORY'}],power:240};
 for(const [key,changes] of [['player',{}],['approved',{status:'Approved'}],['declined',{status:'Declined'}],['prospect',{prospect:true}],['contact',{general:true}],['deleted',{deleted:true}],['merged',{mergedInto:'player'}],['withdrawn',{status:'Withdrawn'}],['transferred',{status:'Transferred'}],['outbound',{transferDirection:'outbound'}]])await db.query('insert into transfer_private.portal_records values ($1,$2,10,$3::jsonb)',['players',key,JSON.stringify({...base,...changes})]);
 await db.exec(`insert into transfer_private.portal_records values('shared','capacities',10,'{"data":{"Gold":1,"Purple":0,"Blue":2,"White":3}}'),('access','support@test.invalid',10,'{"name":"Support","role":"support","status":"active"}'),('access','lead@test.invalid',10,'{"name":"Lead","role":"lead","status":"active"}');`);
 let result=await call('seat-confirmations-list',{token});assert.equal(result.applicants.length,2);assert.equal(result.confirmers.length,3);assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.ok(!JSON.stringify(result).includes('@'));assert.ok(!JSON.stringify(result).includes('fixture_helper'));
 for(const row of result.applicants)assert.deepEqual(Object.keys(row).sort(),['id','name','server','currentAlliance','transferGroup','transferLead','status','confirmedSeat','confirmedBy','confirmerId','confirmedAt','revision'].sort());
 assert.equal((await call('seat-confirmations-list',{staffEmail:'support@test.invalid'})).error,'access_denied');assert.equal((await call('seat-confirmations-list',{staffEmail:'attacker@test.invalid'})).error,'access_denied');assert.equal((await call('seat-confirmations-list',{staffEmail:'lead@test.invalid'})).applicants.length,2);
 // Group lead is a linked player, distinct from staff and confirmer identities.
 await db.query("insert into transfer_private.portal_records values('players','group-leader',10,$1::jsonb)",[JSON.stringify({...base,general:true,name:'Group leader',notes:'PRIVATE LEADER NOTES'})]);
 await db.exec(`insert into transfer_private.portal_records values('shared','transferOrganization',10,'{"data":{"groupLeads":{"glass house 1":"group-leader"},"groupDetails":{"brief":"PRIVATE BRIEF"}}}');`);
 result=await call('seat-confirmations-list',{token});assert.equal(result.applicants[0].transferLead,'Group leader');assert.ok(!JSON.stringify(result).includes('PRIVATE'));
 const resolveLead=async(group)=>(await db.query('select transfer_private.seat_transfer_lead($1) as name',[group])).rows[0].name;
 for(const patch of [{deleted:true},{mergedInto:'other'},{group:'Another group'}]){
  await db.query("update transfer_private.portal_records set payload=$1::jsonb where kind='players' and key='group-leader'",[JSON.stringify({...base,general:true,name:'Group leader',...patch})]);
  assert.equal(await resolveLead(base.group),null);
 }
 await db.query("update transfer_private.portal_records set payload=$1::jsonb where kind='players' and key='group-leader'",[JSON.stringify({...base,general:true,name:'Group leader'})]);
 assert.equal(await resolveLead('Unassigned group'),null);assert.equal(await resolveLead(''),null);
 // Both older group-manager keys and punctuation-normalized profile keys work.
 for(const key of ['glass-house 1','glass house 1']){
  await db.query("update transfer_private.portal_records set payload=$1::jsonb where kind='shared' and key='transferOrganization'",[JSON.stringify({data:{groupLeads:{[key]:'group-leader'}}})]);
  await db.query("update transfer_private.portal_records set payload=jsonb_set(payload,'{group}',to_jsonb($1::text)) where kind='players' and key='group-leader'",['Gláss-House 1']);
  assert.equal(await resolveLead('Gláss-House 1'),'Group leader');
 }
 await db.exec(`update transfer_private.portal_records set payload=jsonb_set(payload,'{group}','"Glass House 1"') where kind='players' and key='group-leader';`);
 const args={token,playerId:'player',seat:'Gold',confirmerId:by,revision:10,transactionId:'fixture-save-one',status:'Approved',notes:'ATTACK'};
 result=await call('seat-confirmations-save',args);assert.equal(result.ok,true);assert.equal(result.applicant.confirmedSeat,'Gold');assert.equal(result.applicant.transferLead,'Group leader');assert.equal(result.applicant.confirmedBy,'Helper name');assert.equal(result.applicant.revision,11);
 const payload=(await db.query("select payload from transfer_private.portal_records where key='player'")).rows[0].payload;assert.equal(payload.status,'Pending');assert.equal(payload.notes,'PRIVATE');assert.equal(payload.history.length,2);assert.equal(payload.seatConfirmedActor,by);
 assert.equal((await call('seat-confirmations-save',args)).alreadySaved,true);assert.equal((await call('seat-confirmations-save',{...args,transactionId:'fixture-stale'})).error,'record_changed');
 assert.equal((await call('seat-confirmations-save',{...args,confirmerId:'forged',transactionId:'fixture-forged'})).error,'invalid_confirmer');
 assert.equal((await call('seat-confirmations-save',{...args,seat:'Yellow',transactionId:'fixture-colour'})).error,'invalid_confirmation');
 assert.equal((await call('seat-confirmations-save',{...args,playerId:'declined',transactionId:'fixture-declined'})).error,'applicant_unavailable');
 assert.equal((await call('seat-confirmations-save',{...args,playerId:'approved',seat:'Purple',transactionId:'fixture-full'})).error,'capacity_full');
 assert.equal((await call('seat-confirmations-save',{...args,playerId:'approved',transactionId:'fixture-approved'})).ok,true);
 await db.query("insert into transfer_private.portal_records values('players','second',12,$1::jsonb)",[JSON.stringify({...base,status:'Approved'})]);
 assert.equal((await call('seat-confirmations-save',{...args,playerId:'second',revision:12,transactionId:'fixture-second'})).error,'capacity_full');
 assert.equal((await call('hub-login-rename',{staffEmail:'lead@test.invalid',accountId:account.id,displayName:'Changed'})).error,'access_denied');
 assert.equal((await call('hub-login-rename',{staffEmail:'owner@test.invalid',accountId:account.id,displayName:'Renamed helper'})).ok,true);
 result=await call('seat-confirmations-list',{token});assert.equal(result.confirmers.find(c=>c.id===by).name,'Renamed helper');assert.equal((await call('session',{token})).user.playerName,'Renamed helper');
 await call('hub-login-disable',{staffEmail:'owner@test.invalid',accountId:account.id});assert.equal((await call('seat-confirmations-list',{token})).error,'access_denied');assert.equal((await call('seat-confirmations-save',{...args,revision:11,transactionId:'fixture-disabled'})).error,'access_denied');
 assert.equal((await call('seat-confirmations-save',{staffEmail:'owner@test.invalid',playerId:'player',seat:'Blue',confirmerId:by,revision:11,transactionId:'fixture-disabled-confirmer'})).error,'invalid_confirmer');
 const privileges=await db.query("select has_function_privilege('anon','transfer_private.seat_confirmation_action(text,jsonb)','EXECUTE') as allowed");assert.equal(privileges.rows[0].allowed,false);
 console.log('PASS: narrow projection, role boundaries, session revocation, valid confirmers, audit attribution, capacity, stale edits, duplicate saves, display-name updates and repeated migration.');
}finally{await db.close();}
