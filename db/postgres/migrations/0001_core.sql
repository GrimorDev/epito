create extension if not exists pgcrypto;

create or replace function app_current_tenant_id()
returns uuid
language sql
stable
parallel safe
as $$
  select nullif(current_setting('app.current_tenant_id', true), '')::uuid
$$;

create or replace function app_current_user_id()
returns uuid
language sql
stable
parallel safe
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  legal_name text not null,
  display_name text not null,
  nip varchar(10),
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (slug = lower(slug)),
  check (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$')
);

create unique index tenants_slug_unique on tenants (lower(slug)) where deleted_at is null;
create unique index tenants_nip_unique on tenants (nip) where nip is not null and deleted_at is null;
create index tenants_settings_gin on tenants using gin (settings);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  phone text,
  status text not null default 'invited' check (status in ('invited', 'active', 'blocked', 'archived')),
  platform_role text not null default 'none' check (platform_role in ('none', 'support', 'supervisor')),
  mfa_enabled boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index users_email_unique on users (lower(email)) where deleted_at is null;

create table tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  role text not null check (role in ('owner', 'admin', 'accountant', 'employee', 'viewer')),
  status text not null default 'active' check (status in ('invited', 'active', 'blocked')),
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index tenant_memberships_user_idx on tenant_memberships (user_id, status);
create index tenant_memberships_permissions_gin on tenant_memberships using gin (permissions);

create table client_companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  name text not null,
  nip varchar(10),
  regon varchar(14),
  krs varchar(10),
  email text,
  phone text,
  status text not null default 'active' check (status in ('onboarding', 'active', 'suspended', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, id)
);

create unique index client_companies_nip_unique on client_companies (tenant_id, nip)
  where nip is not null and deleted_at is null;
create index client_companies_metadata_gin on client_companies using gin (metadata);

create table documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_company_id uuid not null,
  created_by uuid references users(id) on delete set null,
  name text not null,
  category text not null check (category in ('sales', 'costs', 'bank', 'contracts', 'tax', 'other')),
  source text not null default 'upload' check (source in ('upload', 'ksef', 'erp', 'email', 'api')),
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'verified', 'requires_action', 'archived')),
  storage_key text not null,
  mime_type text not null,
  file_size bigint not null check (file_size >= 0),
  checksum_sha256 char(64) not null,
  document_year smallint not null check (document_year between 2000 and 2200),
  document_month smallint not null check (document_month between 1 and 12),
  issued_at date,
  amount numeric(18,2),
  currency char(3) not null default 'PLN',
  ksef_number text,
  structured_data jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (tenant_id, client_company_id)
    references client_companies(tenant_id, id) on delete restrict,
  unique (tenant_id, storage_key),
  unique (tenant_id, id)
);

create index documents_tenant_period_idx on documents (tenant_id, document_year desc, document_month desc);
create index documents_company_status_idx on documents (tenant_id, client_company_id, status);
create index documents_ksef_number_idx on documents (tenant_id, ksef_number) where ksef_number is not null;
create index documents_structured_data_gin on documents using gin (structured_data jsonb_path_ops);

create table payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_company_id uuid not null,
  document_id uuid,
  tax_type text not null check (tax_type in ('vat', 'pit', 'cit', 'zus', 'invoice', 'other')),
  period_label text not null,
  amount numeric(18,2) not null check (amount >= 0),
  currency char(3) not null default 'PLN',
  due_date date not null,
  status text not null default 'due' check (status in ('draft', 'due', 'scheduled', 'processing', 'paid', 'failed', 'cancelled')),
  provider text,
  provider_reference text,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, client_company_id)
    references client_companies(tenant_id, id) on delete restrict,
  foreign key (tenant_id, document_id)
    references documents(tenant_id, id) on delete set null (document_id)
);

create index payments_due_idx on payments (tenant_id, status, due_date);
create index payments_company_idx on payments (tenant_id, client_company_id, created_at desc);
create index payments_metadata_gin on payments using gin (metadata);

create table outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index outbox_events_pending_idx on outbox_events (available_at, created_at)
  where processed_at is null;
create index outbox_events_payload_gin on outbox_events using gin (payload);

create table audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references tenants(id) on delete restrict,
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  ip_address inet,
  user_agent text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_tenant_time_idx on audit_log (tenant_id, created_at desc);
create index audit_log_entity_idx on audit_log (tenant_id, entity_type, entity_id);

create or replace function reject_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_immutable
before update or delete on audit_log
for each row execute function reject_audit_log_mutation();

create or replace function epito_resolve_tenant_slug(requested_slug text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from tenants
  where slug = lower(requested_slug)
    and status = 'active'
    and deleted_at is null
  limit 1
$$;

revoke all on function epito_resolve_tenant_slug(text) from public;
grant execute on function epito_resolve_tenant_slug(text) to epito_app;

alter table tenants enable row level security;
alter table tenants force row level security;
alter table users enable row level security;
alter table users force row level security;
alter table tenant_memberships enable row level security;
alter table tenant_memberships force row level security;
alter table client_companies enable row level security;
alter table client_companies force row level security;
alter table documents enable row level security;
alter table documents force row level security;
alter table payments enable row level security;
alter table payments force row level security;
alter table outbox_events enable row level security;
alter table outbox_events force row level security;
alter table audit_log enable row level security;
alter table audit_log force row level security;

create policy tenants_isolation on tenants
  using (id = app_current_tenant_id())
  with check (id = app_current_tenant_id());

create policy memberships_isolation on tenant_memberships
  using (tenant_id = app_current_tenant_id())
  with check (tenant_id = app_current_tenant_id());

create policy users_isolation on users
  using (
    id = app_current_user_id()
    or exists (
      select 1 from tenant_memberships membership
      where membership.user_id = users.id
        and membership.tenant_id = app_current_tenant_id()
    )
  )
  with check (id = app_current_user_id());

create policy client_companies_isolation on client_companies
  using (tenant_id = app_current_tenant_id())
  with check (tenant_id = app_current_tenant_id());

create policy documents_isolation on documents
  using (tenant_id = app_current_tenant_id())
  with check (tenant_id = app_current_tenant_id());

create policy payments_isolation on payments
  using (tenant_id = app_current_tenant_id())
  with check (tenant_id = app_current_tenant_id());

create policy outbox_events_isolation on outbox_events
  using (tenant_id = app_current_tenant_id())
  with check (tenant_id = app_current_tenant_id());

create policy audit_log_isolation on audit_log
  using (tenant_id = app_current_tenant_id())
  with check (tenant_id = app_current_tenant_id());

grant usage on schema public to epito_app;
grant select, insert, update on tenants, users, tenant_memberships, client_companies, documents, payments, outbox_events to epito_app;
grant delete on tenant_memberships, client_companies, documents, payments to epito_app;
grant select, insert on audit_log to epito_app;
grant usage, select on all sequences in schema public to epito_app;

alter default privileges in schema public
  grant select, insert, update, delete on tables to epito_app;
alter default privileges in schema public
  grant usage, select on sequences to epito_app;
