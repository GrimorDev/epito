create table ksef_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_company_id uuid not null,
  environment text not null default 'test' check (environment in ('test', 'demo', 'production')),
  nip varchar(10) not null check (nip ~ '^[0-9]{10}$'),
  token_ciphertext bytea not null,
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error')),
  access_token_ciphertext bytea,
  access_token_expires_at timestamptz,
  refresh_token_ciphertext bytea,
  refresh_token_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, client_company_id) references client_companies(tenant_id, id) on delete cascade,
  unique (tenant_id, client_company_id)
);

create index ksef_connections_sync_due_idx on ksef_connections (status, last_synced_at) where status = 'connected';

alter table ksef_connections enable row level security;
alter table ksef_connections force row level security;

create policy ksef_connections_isolation on ksef_connections
  using (tenant_id = app_current_tenant_id() or app_is_supervisor())
  with check (tenant_id = app_current_tenant_id() or app_is_supervisor());

grant select, insert, update, delete on ksef_connections to epito_app;
