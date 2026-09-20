-- Pawn to Professor Learning Hub v1.3 - FINALIZATION
-- Run ONLY after v1.3 is deployed and the secure player works.
-- This removes the old public URL values from the activities table.

update public.activities a
set launch_url = null
where exists (
  select 1
  from public.activity_targets t
  where t.activity_id = a.id
);

-- Verify there are no remaining public game links:
-- select id, title, launch_url from public.activities where launch_url is not null;
