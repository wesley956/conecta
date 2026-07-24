create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  version_code bigint not null unique check (version_code > 0),
  version_name text not null check (length(trim(version_name)) between 1 and 64),
  storage_path text not null unique check (length(trim(storage_path)) between 1 and 512),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  signer_sha256 text not null check (signer_sha256 ~ '^[a-f0-9]{64}$'),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 262144000),
  notes text not null default '',
  mandatory boolean not null default false,
  published boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.app_releases enable row level security;

revoke all on table public.app_releases from public, anon, authenticated;
grant all on table public.app_releases to service_role;

create index if not exists app_releases_latest_idx
  on public.app_releases (published_at desc, version_code desc)
  where published = true;

comment on table public.app_releases is
  'Metadados das versões Android assinadas. O APK permanece em bucket privado e só é entregue por URL temporária.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-releases',
  'app-releases',
  false,
  262144000,
  array['application/vnd.android.package-archive']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "deny direct app release reads" on storage.objects;
create policy "deny direct app release reads"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'app-releases' and false);

