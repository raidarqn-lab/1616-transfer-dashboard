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
 await db.exec(await read('backend/seat-confirmations-message.sql'));await db.exec(await read('backend/seat-confirmations-message.sql'));
 await db.exec(await read('backend/seat-confirmations-images.sql'));await db.exec(await read('backend/seat-confirmations-images.sql'));
 await db.exec(await read('backend/seat-confirmations-outreach.sql'));await db.exec(await read('backend/seat-confirmations-outreach.sql'));
 await db.exec(await read('backend/messenger-admin-list.sql'));await db.exec(await read('backend/messenger-admin-list.sql'));
 const call=async(action,args)=>(await db.query('select public.nova_manual_accounts($1,$2::jsonb) as data',[action,JSON.stringify(args)])).rows[0].data;
 const account=await call('hub-login-save',{staffEmail:'owner@test.invalid',accountType:'applicant_messenger',displayName:'Helper name',username:'fixture_helper',hash:'a'.repeat(64),salt:'b'.repeat(64),reason:'Transactional verification'});
 const directory=await call('hub-messenger-list',{staffEmail:'owner@test.invalid'});assert.equal(directory.accounts.length,1);assert.deepEqual(Object.keys(directory.accounts[0]).sort(),['id','playerName','accountType','leadership','username','state'].sort());assert.equal(directory.accounts[0].state,'active');
 for(const staffEmail of ['support@test.invalid','lead@test.invalid','attacker@test.invalid'])await assert.rejects(call('hub-messenger-list',{staffEmail}),/Access denied/);
 const login=await call('login-finish',{accountId:account.id,version:1});const token=login.token,by='manual:'+account.id;
 const base={name:'Fixture applicant',applicationId:'application-one',applicationConfirmations:[{applicationId:'application-one',confirmationCode:'1616-TEST-12345678'}],server:1626,alliance:'RiZZ',group:'Glass House 1',status:'Pending',notes:'PRIVATE',history:[{text:'PRIVATE HISTORY'}],power:240};
 for(const [key,changes] of [['player',{}],['approved',{status:'Approved'}],['declined',{status:'Declined'}],['prospect',{prospect:true}],['contact',{general:true}],['deleted',{deleted:true}],['merged',{mergedInto:'player'}],['withdrawn',{status:'Withdrawn'}],['transferred',{status:'Transferred'}],['outbound',{transferDirection:'outbound'}]])await db.query('insert into transfer_private.portal_records values ($1,$2,10,$3::jsonb)',['players',key,JSON.stringify({...base,...changes})]);
 await db.exec(`insert into transfer_private.portal_records values('shared','capacities',10,'{"data":{"Gold":1,"Purple":0,"Blue":2,"White":3}}'),('access','support@test.invalid',10,'{"name":"Support","role":"support","status":"active"}'),('access','lead@test.invalid',10,'{"name":"Lead","role":"lead","status":"active"}');`);
 let result=await call('seat-confirmations-list',{token});assert.equal(result.applicants.length,2);assert.equal(result.confirmers.length,3);assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.ok(!JSON.stringify(result).includes('@'));assert.ok(!JSON.stringify(result).includes('fixture_helper'));
 for(const row of result.applicants)assert.deepEqual(Object.keys(row).sort(),['id','name','message','server','currentAlliance','transferGroup','transferLead','status','confirmedSeat','confirmedBy','confirmerId','confirmedAt','revision','imageVersion','outreach'].sort());
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
 assert.match(result.applicants[0].message,/1616-TEST-12345678$/);
 const missing=(await db.query("select transfer_private.seat_confirmation_row('test',$1::jsonb,1) as row",[JSON.stringify({...base,applicationConfirmations:[]})])).rows[0].row;assert.equal(missing.message,null);
 // Screenshots are private and independent of seat/record revisions.
 const image='data:image/jpeg;base64,/9j/2Q==',uploadId='11111111-1111-4111-8111-111111111111';
 const imageArgs={token,playerId:'player',image,uploadId,imageVersion:''};
 assert.equal((await call('seat-image-get',{token,playerId:'player'})).error,'image_missing');
 for(const staffEmail of ['support@test.invalid','attacker@test.invalid'])for(const action of ['seat-image-get','seat-image-save'])assert.equal((await call(action,{...imageArgs,token:undefined,staffEmail})).error,'access_denied');
 for(const badImage of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,YWJjZA==','data:image/jpeg;base64,'+'A'.repeat(1200000)])assert.equal((await call('seat-image-save',{...imageArgs,image:badImage})).error,'invalid_image');
 assert.equal((await call('seat-image-save',{...imageArgs,playerId:'deleted'})).error,'applicant_unavailable');
 assert.equal((await call('seat-image-save',imageArgs)).ok,true);
 assert.equal((await call('seat-image-save',imageArgs)).ok,true); // retry is idempotent
 let screenshot=await call('seat-image-get',{token,playerId:'player'});assert.equal(screenshot.image,image);assert.equal(screenshot.uploadedBy,'Helper name');assert.ok(!JSON.stringify(screenshot).includes('@'));
 result=await call('seat-confirmations-list',{token});const withImage=result.applicants.find(p=>p.id==='player');assert.equal(withImage.imageVersion,uploadId);assert.equal(withImage.revision,10);assert.equal(withImage.confirmedSeat,null);assert.ok(!JSON.stringify(result).includes('data:image'));
 const replacement='22222222-2222-4222-8222-222222222222';
 assert.equal((await call('seat-image-save',{...imageArgs,uploadId:replacement})).error,'image_changed');
 assert.equal((await call('seat-image-save',{...imageArgs,uploadId:replacement,imageVersion:uploadId})).ok,true);
 assert.equal((await call('seat-image-get',{staffEmail:'lead@test.invalid',playerId:'player'})).imageVersion,replacement);
 await db.exec("update transfer_private.portal_records set payload=jsonb_set(payload,'{deleted}','true') where key='player'");
 assert.equal((await call('seat-image-get',{token,playerId:'player'})).error,'applicant_unavailable');
 await db.exec("update transfer_private.portal_records set payload=payload-'deleted' where key='player'");
 assert.equal((await db.query("select count(*)::int n from nova_evidence_private.hub_audit where action='seat-image-save'")).rows[0].n,2);
 for(const role of ['anon','authenticated']){
  assert.equal((await db.query("select has_table_privilege($1,'transfer_private.seat_images','SELECT') allowed",[role])).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege($1,'transfer_private.seat_image_action(text,jsonb,text,text)','EXECUTE') allowed",[role])).rows[0].allowed,false);
 }
 // Claims share the global commit lock; a second caller cannot replace the first owner.
 const outreach=(command,extra={})=>call('seat-outreach',{token,playerId:'player',command,...extra});
 for(const staffEmail of ['support@test.invalid','attacker@test.invalid'])assert.equal((await outreach('claim',{token:undefined,staffEmail})).error,'access_denied');
 assert.equal((await outreach('check')).error,'claim_required');
 let claimed=await outreach('claim');assert.equal(claimed.applicant.outreach.ownerId,by);assert.equal(claimed.applicant.revision,10);
 const claimVersion=claimed.applicant.outreach.version;
 assert.equal((await outreach('claim')).applicant.outreach.version,claimVersion);
 assert.equal((await outreach('claim',{token:undefined,staffEmail:'lead@test.invalid'})).error,'already_claimed');
 assert.equal((await outreach('release',{token:undefined,staffEmail:'lead@test.invalid',version:claimVersion})).error,'already_claimed');
 assert.equal((await outreach('reassign',{ownerId:by,version:claimVersion})).error,'access_denied');
 assert.equal((await outreach('check')).ok,true);
 assert.equal((await outreach('sent',{version:'stale'})).error,'outreach_changed');
 const sent=await outreach('sent',{version:claimVersion});assert.equal(sent.applicant.outreach.status,'awaiting');
 assert.equal((await outreach('release',{version:claimVersion})).error,'outreach_changed');
 const leadId=(await call('seat-confirmations-list',{staffEmail:'lead@test.invalid'})).currentConfirmerId;
 const assigned=await outreach('reassign',{token:undefined,staffEmail:'owner@test.invalid',version:sent.applicant.outreach.version,ownerId:leadId});
 assert.equal(assigned.applicant.outreach.ownerId,leadId);assert.equal(assigned.applicant.outreach.status,'awaiting');
 assert.equal((await outreach('check')).error,'claim_required');
 assert.equal((await outreach('release',{token:undefined,staffEmail:'owner@test.invalid',version:assigned.applicant.outreach.version})).applicant.outreach,null);
 assert.equal((await outreach('claim',{playerId:'deleted'})).error,'applicant_unavailable');
 assert.equal((await call('seat-confirmations-list',{token})).canManageOutreach,false);
 assert.equal((await call('seat-confirmations-list',{staffEmail:'owner@test.invalid'})).canManageOutreach,true);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_table_privilege($1,'transfer_private.seat_outreach','SELECT') allowed",[role])).rows[0].allowed,false);
 const args={token,playerId:'player',seat:'Gold',confirmerId:by,revision:10,transactionId:'fixture-save-one',status:'Approved',notes:'ATTACK'};
 result=await call('seat-confirmations-save',args);assert.equal(result.ok,true);assert.equal(result.applicant.confirmedSeat,'Gold');assert.equal(result.applicant.transferLead,'Group leader');assert.equal(result.applicant.confirmedBy,'Helper name');assert.equal(result.applicant.revision,11);
 assert.equal((await outreach('claim')).error,'already_confirmed');
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
 for(const action of ['seat-image-get','seat-image-save'])assert.equal((await call(action,imageArgs)).error,'access_denied');
 const disabledDirectory=await call('hub-messenger-list',{staffEmail:'owner@test.invalid'});assert.equal(disabledDirectory.accounts[0].state,'disabled');assert.equal(disabledDirectory.accounts[0].playerName,'Renamed helper');
 const privileges=await db.query("select has_function_privilege('anon','transfer_private.seat_confirmation_action(text,jsonb)','EXECUTE') as allowed");assert.equal(privileges.rows[0].allowed,false);
 await db.exec(await read('backend/seat-confirmations-language.sql'));
 await db.exec(await read('backend/seat-confirmations-language.sql'));
 console.log('PASS: seat language projection and repeat migration.');
 console.log('PASS: narrow projection, role boundaries, session revocation, valid confirmers, audit attribution, capacity, stale edits, duplicate saves, display-name updates and repeated migration.');
}finally{await db.close();}
