alter table payments add column payment_reference text;

create unique index payments_reference_unique on payments (tenant_id, payment_reference)
  where payment_reference is not null;

create table bank_statement_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_company_id uuid not null,
  document_id uuid,
  value_date date not null,
  amount numeric(18,2) not null,
  currency char(3) not null default 'PLN',
  description text not null,
  counterparty_name text,
  counterparty_account text,
  statement_reference text not null,
  matched_payment_id uuid references payments(id) on delete set null,
  match_status text not null default 'unmatched' check (match_status in ('matched', 'unmatched', 'ambiguous')),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, client_company_id) references client_companies(tenant_id, id) on delete restrict,
  foreign key (tenant_id, document_id) references documents(tenant_id, id) on delete set null (document_id),
  unique (tenant_id, client_company_id, statement_reference, value_date)
);

create index bank_statement_transactions_company_idx on bank_statement_transactions (tenant_id, client_company_id, value_date desc);
create index bank_statement_transactions_unmatched_idx on bank_statement_transactions (tenant_id, match_status) where match_status != 'matched';

alter table bank_statement_transactions enable row level security;
alter table bank_statement_transactions force row level security;

create policy bank_statement_transactions_isolation on bank_statement_transactions
  using (tenant_id = app_current_tenant_id() or app_is_supervisor())
  with check (tenant_id = app_current_tenant_id() or app_is_supervisor());

create policy bank_statement_transactions_platform_staff_select on bank_statement_transactions
  for select using (app_is_platform_staff());

grant select, insert, update, delete on bank_statement_transactions to epito_app;
