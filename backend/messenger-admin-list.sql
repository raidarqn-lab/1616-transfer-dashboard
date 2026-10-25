begin;
-- Add an owner-only messenger directory after the existing account-management gate.
do $$declare definition text; marker text:=' if action=''hub-login-search'' then'; injection text:=$inject$
 if action='hub-messenger-list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',account_id,'playerName',display_name,'accountType','applicant_messenger',
   'leadership',false,'username',username,'state',case when active then 'active' else 'disabled' end) order by lower(display_name),username),'[]'::jsonb)
  into result from nova_evidence_private.manual_accounts where account_type='applicant_messenger';
  return jsonb_build_object('accounts',result);
 end if;
$inject$;
begin
 select pg_get_functiondef('public.nova_manual_accounts(text,jsonb)'::regprocedure) into definition;
 if position('if action=''hub-messenger-list'' then' in definition)=0 then
  if position(marker in definition)=0 or position('if not exists(select 1 from nova_evidence_private.hub_staff where email=actor and status=''active'' and role=''master'' and accounts_manage) then raise exception ''Access denied'';end if;' in definition)=0
   or position(marker in definition)<position('then raise exception ''Access denied'';end if;' in definition) then raise exception 'Unexpected account-management gate';end if;
  execute replace(definition,marker,injection||marker);
 end if;
end $$;
commit;
