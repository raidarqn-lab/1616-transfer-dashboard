-- Replace only the untouched stock message; preserve leaders' custom messages.
begin;
alter table transfer_private.welcome_pages alter column message set default
 'Hi {player}! My name is {r4}, and I''d love to welcome you to 1616! We''d be happy to have you join {alliance} for the season. Once you arrive on 1616, please apply to {alliance}. We''re looking forward to welcoming you to the family!';
with changed as (
 update transfer_private.welcome_pages
 set message='Hi {player}! My name is {r4}, and I''d love to welcome you to 1616! We''d be happy to have you join {alliance} for the season. Once you arrive on 1616, please apply to {alliance}. We''re looking forward to welcoming you to the family!',
     revision=revision+1, updated_at=now(), updated_by='welcome-template-update'
 where message='Hi {player}, welcome to {alliance}! We are happy to have you with us.'
 returning alliance,revision
)
insert into transfer_private.welcome_audit(alliance,actor,action,detail)
 select alliance,'welcome-template-update','template.default',jsonb_build_object(
  'previousMessage','Hi {player}, welcome to {alliance}! We are happy to have you with us.',
  'revision',revision) from changed;
commit;
