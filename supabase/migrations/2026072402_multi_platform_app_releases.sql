alter table public.app_releases
  add column if not exists platform text not null default 'android',
  add column if not exists file_extension text not null default 'apk';

alter table public.app_releases
  alter column signer_sha256 drop not null;

update public.app_releases
set platform = 'android',
    file_extension = 'apk'
where platform is null
   or platform = ''
   or file_extension is null
   or file_extension = '';

alter table public.app_releases
  drop constraint if exists app_releases_version_code_key,
  drop constraint if exists app_releases_platform_check,
  drop constraint if exists app_releases_file_extension_check;

alter table public.app_releases
  add constraint app_releases_platform_check
    check (platform in ('android', 'webos', 'tizen')),
  add constraint app_releases_file_extension_check
    check (
      (platform = 'android' and file_extension = 'apk')
      or (platform = 'webos' and file_extension = 'ipk')
      or (platform = 'tizen' and file_extension = 'wgt')
    );

create unique index if not exists app_releases_platform_version_code_key
  on public.app_releases (platform, version_code);

drop index if exists app_releases_latest_idx;
create index app_releases_latest_idx
  on public.app_releases (platform, published_at desc, version_code desc)
  where published = true;

update storage.buckets
set allowed_mime_types = array[
  'application/vnd.android.package-archive',
  'application/octet-stream',
  'application/zip'
]::text[]
where id = 'app-releases';

comment on table public.app_releases is
  'Metadados protegidos das versões Android, LG webOS e Samsung Tizen.';
