const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema nova_evidence_private;create schema transfer_private;create schema extensions;
 create table transfer_private.portal_records(kind text,key text,revision bigint,payload jsonb,primary key(kind,key));
 create table nova_evidence_private.hub_staff(email text primary key,role text,alliances jsonb,status text,accounts_manage boolean,updated_by text);
 create table nova_evidence_private.admin_identities(email text primary key,id uuid,display_name text,player_key text,revision bigint,updated_at timestamptz,updated_by text);
 create table nova_evidence_private.member_links(account_id uuid primary key,player_key text,active boolean,historical_until timestamptz);
 create table nova_evidence_private.hub_audit(actor_email text,action text,subject text,detail jsonb);
 insert into nova_evidence_private.hub_staff values('owner@example.invalid','master','[]','active',true,'test');
 -- Local substitutes for pgcrypto wrappers; no production passwords or records are used.
 create function extensions.digest(t text,algorithm text) returns bytea language sql as $$select sha256(convert_to(t,'UTF8'))$$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'hex')$$;`);
 await db.exec(await fs.readFile(root+'/deployment/manual-accounts/accounts.sql','utf8'));
 const migration=(await fs.readFile(root+'/backend/applicant-messenger.sql','utf8')).replace(/commit;\s*$/,'');
 const verify=await fs.readFile(root+'/backend/verify-applicant-messenger.sql','utf8');
 const prior=(await fs.readFile(root+'/deployment/manual-accounts/verify.sql','utf8')).replace(/^begin;\s*/,'').split('rollback;')[0];
 await db.exec(migration+'\n'+verify+'\n'+prior+'\nrollback;');
 console.log('PASS: local PostgreSQL transaction tests for new and existing roles, projection privacy, scopes, reset, expiry, revocation, rate limits and rollback.');
 const fields=await db.query("select column_name from information_schema.columns where table_schema='nova_evidence_private' and table_name='manual_accounts' and column_name='account_type'");
 if(fields.rows.length)throw Error('Schema rollback failed');
 // Verify production migration can be applied twice, and unrelated logins remain intact.
 await db.exec(await fs.readFile(root+'/backend/applicant-messenger.sql','utf8'));
 await db.exec(await fs.readFile(root+'/backend/applicant-messenger.sql','utf8'));
 const original=await db.query("select pg_get_functiondef('public.nova_manual_accounts(text,jsonb)'::regprocedure) as source");
 await db.exec(original.rows[0].source.replace(' || transfer_private.applicant_messenger_details(p.key,p.payload)',''));
 await db.exec(await fs.readFile(root+'/backend/applicant-messenger-details.sql','utf8'));
 await db.exec(await fs.readFile(root+'/backend/applicant-messenger-details.sql','utf8'));
 await db.exec('begin;'+verify+'rollback;');
 console.log('PASS: old-to-new detail migration, repeat migration and schema rollback.');
} catch(error){console.error(error.message);console.error(error.where||'');process.exitCode=1;}finally{await db.close();}
