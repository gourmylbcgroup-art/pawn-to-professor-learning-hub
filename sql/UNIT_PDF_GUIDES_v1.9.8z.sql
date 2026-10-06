-- Pawn to Professor v1.9.8z
-- Run this in the MAIN Pawn to Professor Supabase project.
-- Do NOT run it in the separate PDF/Documents Supabase project.

create table if not exists public.unit_pdf_guides (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null unique references public.units(id) on delete cascade,
  title text not null default 'Unit Activity Guide',
  description text,
  storage_path text not null,
  published boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unit_pdf_guides_pdf_path check (
    length(storage_path) between 1 and 500
    and storage_path !~ '(^/|\.\.|^https?://)'
    and lower(storage_path) like '%.pdf'
  )
);

alter table public.unit_pdf_guides enable row level security;

revoke all on table public.unit_pdf_guides from anon;
revoke all on table public.unit_pdf_guides from authenticated;
grant select, insert, update, delete on table public.unit_pdf_guides to service_role;

create index if not exists unit_pdf_guides_unit_idx
  on public.unit_pdf_guides(unit_id);

comment on table public.unit_pdf_guides is
  'Maps a Learning Hub Unit to a private PDF path in the separate Docs Supabase Storage project.';
