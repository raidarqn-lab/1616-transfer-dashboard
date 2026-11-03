-- Run inside a transaction after the migration, then ROLLBACK.
do $test$
declare admin_ text; ids jsonb; stamp_ timestamptz; denied boolean:=false; n integer;
begin
 select admin_email into admin_ from transfer_private.portal_control where singleton;
 select enabled_at into stamp_ from transfer_private.toolkit_lookup_config where singleton;
 if has_function_privilege('anon','public.transfer_portal_toolkit_candidates(text)','EXECUTE')
  or has_function_privilege('authenticated','public.transfer_portal_toolkit_candidates(text)','EXECUTE') then raise exception 'Lookup RPC exposed to clients';end if;
 begin perform public.transfer_portal_toolkit_candidates('unknown-toolkit-test@example.invalid');
 exception when others then denied:=true;end;
 if not denied then raise exception 'Unknown staff identity allowed';end if;
 for n in 1..2 loop
  insert into transfer_private.portal_records(kind,key,revision,payload) values('players',(910000000+n)::text,0,
   jsonb_build_object('id',910000000+n,'applicationId','APP-TOOLKIT-TEST-000'||n,'name','Toolkit Test Player '||n,
    'server','1608','alliance','TEST','general',false,'prospect',false,'status','Pending','history','[]'::jsonb));
  insert into transfer_private.applications(id,code_hash,payload,created_at) values('APP-TOOLKIT-TEST-000'||n,
   encode(sha256(convert_to('toolkit-test-'||n,'UTF8')),'hex'),jsonb_build_object('username','Toolkit Test Player '||n,'currentServer','1608','alliance','TEST'),
   stamp_+case when n=1 then interval '-1 day' else interval '1 second' end);
 end loop;
 ids:=public.transfer_portal_toolkit_candidates(admin_);
 if ids?'910000001' or not(ids?'910000002') then raise exception 'New-applicant date boundary failed';end if;
 update transfer_private.portal_records set payload=payload||jsonb_build_object('lwToolkitCheck',jsonb_build_object(
  'inputs',jsonb_build_object('uid','','server','1608','name','Toolkit Test Player 2'),'status','needs-review')) where kind='players' and key='910000002';
 if public.transfer_portal_toolkit_candidates(admin_)?'910000002' then raise exception 'Completed check repeated';end if;
 update transfer_private.portal_records set payload=payload||jsonb_build_object('sourceUid','123') where kind='players' and key='910000002';
 if not(public.transfer_portal_toolkit_candidates(admin_)?'910000002') then raise exception 'New verified identity not rechecked';end if;
 update transfer_private.portal_records set payload=payload||jsonb_build_object('status','Withdrawn') where kind='players' and key='910000002';
 if public.transfer_portal_toolkit_candidates(admin_)?'910000002' then raise exception 'Withdrawn applicant included';end if;
end $test$;
select 'LWToolkit new-applicant boundary, identity recheck, withdrawal and access tests passed; rolling back fixtures.' as result;
