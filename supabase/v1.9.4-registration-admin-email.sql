-- Pawn to Professor v1.9.4
-- Primary Admin + registration email notification setup
-- Safe to run more than once.

begin;

-- Stéphane must be an active Admin and must receive registration notifications.
update public.profiles
set
  role = 'admin',
  status = 'active',
  contact_email = 'stephane@alphagenus.com'
where lower(trim(username)) = 'stephane';

commit;

-- Verify the account after running the patch.
select
  username,
  display_name,
  role,
  status,
  contact_email
from public.profiles
where lower(trim(username)) = 'stephane';
