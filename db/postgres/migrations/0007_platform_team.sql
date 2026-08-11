alter table users drop constraint if exists users_platform_role_check;
alter table users add constraint users_platform_role_check
  check (platform_role in ('none', 'support', 'helpdesk', 'moderator', 'developer', 'admin', 'supervisor'));

create or replace function app_is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from users
    where id = app_current_user_id()
      and platform_role in ('support', 'helpdesk', 'moderator', 'developer', 'admin', 'supervisor')
      and status = 'active'
      and deleted_at is null
  )
$$;

revoke all on function app_is_platform_staff() from public;
grant execute on function app_is_platform_staff() to epito_app;

create policy tenants_platform_staff_select on tenants
  for select using (app_is_platform_staff());

create policy users_platform_staff_select on users
  for select using (app_is_platform_staff());

create policy memberships_platform_staff_select on tenant_memberships
  for select using (app_is_platform_staff());

create policy companies_platform_staff_select on client_companies
  for select using (app_is_platform_staff());

create policy documents_platform_staff_select on documents
  for select using (app_is_platform_staff());

create policy payments_platform_staff_select on payments
  for select using (app_is_platform_staff());

create policy audit_platform_staff_select on audit_log
  for select using (app_is_platform_staff());

create table platform_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index platform_audit_log_time_idx on platform_audit_log (created_at desc);
create index platform_audit_log_entity_idx on platform_audit_log (entity_type, entity_id);

alter table platform_audit_log enable row level security;
alter table platform_audit_log force row level security;

create policy platform_audit_staff_select on platform_audit_log
  for select using (app_is_platform_staff());

create policy platform_audit_staff_insert on platform_audit_log
  for insert with check (app_is_platform_staff() and actor_user_id = app_current_user_id());

grant select, insert on platform_audit_log to epito_app;
grant usage, select on sequence platform_audit_log_id_seq to epito_app;
