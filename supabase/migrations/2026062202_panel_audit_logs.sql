create table if not exists public.panel_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text,
  entity_id uuid,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists panel_audit_logs_created_at_idx
  on public.panel_audit_logs(created_at desc);

create index if not exists panel_audit_logs_action_idx
  on public.panel_audit_logs(action);

create index if not exists panel_audit_logs_entity_idx
  on public.panel_audit_logs(entity_type, entity_id);

alter table public.panel_audit_logs enable row level security;
