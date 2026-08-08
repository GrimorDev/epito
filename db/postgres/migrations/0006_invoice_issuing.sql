alter table client_companies
  add column address text,
  add column bank_account_number text;

create table counterparties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_company_id uuid not null,
  name text not null,
  nip varchar(10) check (nip ~ '^[0-9]{10}$'),
  address text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (tenant_id, client_company_id) references client_companies(tenant_id, id) on delete cascade,
  unique (tenant_id, id)
);

create index counterparties_company_idx on counterparties (tenant_id, client_company_id) where deleted_at is null;

alter table counterparties enable row level security;
alter table counterparties force row level security;

create policy counterparties_isolation on counterparties
  using (tenant_id = app_current_tenant_id() or app_is_supervisor())
  with check (tenant_id = app_current_tenant_id() or app_is_supervisor());

grant select, insert, update, delete on counterparties to epito_app;

create table issued_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_company_id uuid not null,
  counterparty_id uuid not null,
  document_id uuid,
  invoice_number text not null,
  sequence_in_month integer not null check (sequence_in_month > 0),
  issued_at date not null,
  due_date date,
  currency char(3) not null default 'PLN',
  bank_account_number text,
  lines jsonb not null,
  invoice_xml text not null,
  net_total numeric(18,2) not null check (net_total >= 0),
  vat_total numeric(18,2) not null check (vat_total >= 0),
  gross_total numeric(18,2) not null check (gross_total >= 0),
  status text not null default 'draft' check (status in ('draft', 'queued', 'submitted', 'accepted', 'rejected', 'failed')),
  ksef_environment text check (ksef_environment in ('test', 'demo', 'production')),
  ksef_session_reference text,
  ksef_invoice_reference text,
  ksef_number text,
  upo_storage_key text,
  error_message text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, client_company_id) references client_companies(tenant_id, id) on delete restrict,
  foreign key (tenant_id, counterparty_id) references counterparties(tenant_id, id) on delete restrict,
  foreign key (tenant_id, document_id) references documents(tenant_id, id) on delete set null (document_id),
  unique (tenant_id, client_company_id, invoice_number)
);

create index issued_invoices_status_idx on issued_invoices (status, updated_at) where status in ('queued', 'submitted');
create index issued_invoices_company_idx on issued_invoices (tenant_id, client_company_id, issued_at desc);

alter table issued_invoices enable row level security;
alter table issued_invoices force row level security;

create policy issued_invoices_isolation on issued_invoices
  using (tenant_id = app_current_tenant_id() or app_is_supervisor())
  with check (tenant_id = app_current_tenant_id() or app_is_supervisor());

grant select, insert, update on issued_invoices to epito_app;
