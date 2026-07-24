begin;

select plan(5);

select has_table('public', 'app_releases', 'Tabela de versões protegidas existe');
select col_is_pk('public', 'app_releases', 'id', 'Release possui chave primária');
select is(
  (select public from storage.buckets where id = 'app-releases'),
  false,
  'Bucket de APK permanece privado'
);
select is(
  (select file_size_limit from storage.buckets where id = 'app-releases'),
  262144000::bigint,
  'Bucket limita APK a 250 MiB'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.app_releases'::regclass),
  true,
  'RLS está habilitado nos metadados de release'
);

select * from finish();
rollback;

