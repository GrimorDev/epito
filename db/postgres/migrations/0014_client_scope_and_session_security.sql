-- Production access hardening.
--
-- A tenant represents an accounting office. Individual companies served by
-- that office need a second authorization boundary so an end client can never
-- see another client's documents or payments. Existing office memberships
-- remain tenant-wide; client accounts use access_scope='assigned_companies'
-- and explicit rows in client_company_memberships.

alter table users
  add column auth_version integer not null default 1 check (auth_version > 0);

alter table tenant_memberships
  add column access_scope text not null default 'tenant'
  check (access_scope in ('tenant', 'assigned_companies'));

create table client_company_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  client_company_id uuid not null,
  user_id uuid not null references users(id) on delete restrict,
  role text not null default 'viewer' check (role in ('owner', 'member', 'viewer')),
  status text not null default 'active' check (status in ('invited', 'active', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, client_company_id)
    references client_companies(tenant_id, id) on delete cascade,
  unique (tenant_id, client_company_id, user_id)
);

create index client_company_memberships_user_idx
  on client_company_memberships (user_id, tenant_id, status);

alter table client_company_memberships enable row level security;
alter table client_company_memberships force row level security;

-- Support staff handle tickets only. Only developer/admin/supervisor may use
-- audited technical access to tenant data.
create or replace function app_is_platform_data_operator()
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
      and platform_role in ('developer', 'admin', 'supervisor')
      and status = 'active'
      and deleted_at is null
  )
$$;

create or replace function app_has_tenant_wide_access()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from tenant_memberships membership
    where membership.tenant_id = app_current_tenant_id()
      and membership.user_id = app_current_user_id()
      and membership.status = 'active'
      and membership.access_scope = 'tenant'
  )
$$;

create or replace function app_can_manage_tenant()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_is_platform_data_operator() or exists (
    select 1 from tenant_memberships membership
    where membership.tenant_id = app_current_tenant_id()
      and membership.user_id = app_current_user_id()
      and membership.status = 'active'
      and membership.access_scope = 'tenant'
      and membership.role in ('owner', 'admin')
  )
$$;

create or replace function app_can_mutate_client_data()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_is_platform_data_operator() or exists (
    select 1 from tenant_memberships membership
    where membership.tenant_id = app_current_tenant_id()
      and membership.user_id = app_current_user_id()
      and membership.status = 'active'
      and membership.access_scope = 'tenant'
      and membership.role in ('owner', 'admin', 'accountant')
  )
$$;

create or replace function app_can_mutate_documents()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_is_platform_data_operator() or exists (
    select 1 from tenant_memberships membership
    where membership.tenant_id = app_current_tenant_id()
      and membership.user_id = app_current_user_id()
      and membership.status = 'active'
      and membership.role in ('owner', 'admin', 'accountant', 'employee')
  )
$$;

create or replace function app_can_access_office_data()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_is_platform_data_operator() or exists (
    select 1 from tenant_memberships membership
    where membership.tenant_id = app_current_tenant_id()
      and membership.user_id = app_current_user_id()
      and membership.status = 'active'
      and membership.access_scope = 'tenant'
      and membership.role in ('owner', 'admin', 'accountant')
  )
$$;

create or replace function app_can_access_client_company(requested_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_is_platform_data_operator()
    or app_has_tenant_wide_access()
    or exists (
      select 1
      from client_company_memberships membership
      where membership.tenant_id = app_current_tenant_id()
        and membership.client_company_id = requested_company_id
        and membership.user_id = app_current_user_id()
        and membership.status = 'active'
    )
$$;

revoke all on function app_is_platform_data_operator() from public;
revoke all on function app_has_tenant_wide_access() from public;
revoke all on function app_can_manage_tenant() from public;
revoke all on function app_can_mutate_client_data() from public;
revoke all on function app_can_mutate_documents() from public;
revoke all on function app_can_access_office_data() from public;
revoke all on function app_can_access_client_company(uuid) from public;
grant execute on function app_is_platform_data_operator() to epito_app;
grant execute on function app_has_tenant_wide_access() to epito_app;
grant execute on function app_can_manage_tenant() to epito_app;
grant execute on function app_can_mutate_client_data() to epito_app;
grant execute on function app_can_mutate_documents() to epito_app;
grant execute on function app_can_access_office_data() to epito_app;
grant execute on function app_can_access_client_company(uuid) to epito_app;

-- Tenant and user directory policies. Assigned-company users can see only
-- themselves and their own assignment rows.
drop policy if exists tenants_isolation on tenants;
create policy tenants_isolation on tenants
  using (id = app_current_tenant_id() or app_is_platform_data_operator())
  with check (
    (id = app_current_tenant_id() and app_can_manage_tenant())
    or app_is_platform_data_operator()
  );

drop policy if exists memberships_isolation on tenant_memberships;
create policy memberships_isolation on tenant_memberships
  using (
    (
      tenant_id = app_current_tenant_id()
      and (user_id = app_current_user_id() or app_has_tenant_wide_access())
    )
    or app_is_platform_data_operator()
  )
  with check (
    (tenant_id = app_current_tenant_id() and app_can_manage_tenant())
    or app_is_platform_data_operator()
  );

drop policy if exists users_isolation on users;
create policy users_isolation on users
  using (
    id = app_current_user_id()
    or app_is_platform_data_operator()
    or (
      app_has_tenant_wide_access()
      and exists (
        select 1 from tenant_memberships membership
        where membership.user_id = users.id
          and membership.tenant_id = app_current_tenant_id()
      )
    )
  )
  with check (id = app_current_user_id() or app_can_manage_tenant());

drop policy if exists client_company_memberships_isolation on client_company_memberships;
create policy client_company_memberships_isolation on client_company_memberships
  using (
    (
      tenant_id = app_current_tenant_id()
      and (user_id = app_current_user_id() or app_has_tenant_wide_access())
    )
    or app_is_platform_data_operator()
  )
  with check (
    (tenant_id = app_current_tenant_id() and app_can_manage_tenant())
    or app_is_platform_data_operator()
  );

-- Company-scoped records are readable by assigned clients. Mutations stay
-- office-only, with application-level role checks adding a narrower layer.
drop policy if exists client_companies_isolation on client_companies;
create policy client_companies_isolation on client_companies
  using (
    tenant_id = app_current_tenant_id()
    and app_can_access_client_company(id)
  )
  with check (tenant_id = app_current_tenant_id() and app_can_mutate_client_data());

drop policy if exists documents_isolation on documents;
create policy documents_isolation on documents
  using (
    tenant_id = app_current_tenant_id()
    and app_can_access_client_company(client_company_id)
  )
  with check (
    tenant_id = app_current_tenant_id()
    and app_can_access_client_company(client_company_id)
    and app_can_mutate_documents()
  );

drop policy if exists payments_isolation on payments;
create policy payments_isolation on payments
  using (
    tenant_id = app_current_tenant_id()
    and app_can_access_client_company(client_company_id)
  )
  with check (
    tenant_id = app_current_tenant_id()
    and app_can_access_client_company(client_company_id)
    and app_can_mutate_client_data()
  );

-- Office-only operational records. End clients receive the original document
-- and payment state, not KSeF tokens, bank imports or accounting internals.
drop policy if exists ksef_connections_isolation on ksef_connections;
create policy ksef_connections_isolation on ksef_connections
  using (tenant_id = app_current_tenant_id() and app_can_access_office_data())
  with check (tenant_id = app_current_tenant_id() and app_can_manage_tenant());

drop policy if exists counterparties_isolation on counterparties;
create policy counterparties_isolation on counterparties
  using (tenant_id = app_current_tenant_id() and (app_can_access_office_data() or app_can_mutate_documents()))
  with check (tenant_id = app_current_tenant_id() and app_can_mutate_documents());

drop policy if exists issued_invoices_isolation on issued_invoices;
create policy issued_invoices_isolation on issued_invoices
  using (tenant_id = app_current_tenant_id() and app_can_access_office_data())
  with check (tenant_id = app_current_tenant_id() and app_can_access_office_data());

drop policy if exists bank_statement_transactions_isolation on bank_statement_transactions;
create policy bank_statement_transactions_isolation on bank_statement_transactions
  using (tenant_id = app_current_tenant_id() and app_can_access_office_data())
  with check (tenant_id = app_current_tenant_id() and app_can_access_office_data());

drop policy if exists outbox_events_isolation on outbox_events;
create policy outbox_events_isolation on outbox_events
  using (tenant_id = app_current_tenant_id() and app_can_access_office_data())
  with check (tenant_id = app_current_tenant_id() and app_can_access_office_data());

drop policy if exists audit_log_isolation on audit_log;
create policy audit_log_isolation on audit_log
  using (
    tenant_id = app_current_tenant_id()
    and (app_has_tenant_wide_access() or actor_user_id = app_current_user_id())
  )
  with check (tenant_id = app_current_tenant_id() and app_can_mutate_documents());

-- Replace the old all-platform-staff bypass with a data-operator-only policy.
drop policy if exists users_platform_staff_select on users;
drop policy if exists memberships_platform_staff_select on tenant_memberships;
drop policy if exists companies_platform_staff_select on client_companies;
drop policy if exists documents_platform_staff_select on documents;
drop policy if exists payments_platform_staff_select on payments;
drop policy if exists audit_platform_staff_select on audit_log;
drop policy if exists bank_statement_transactions_platform_staff_select on bank_statement_transactions;

create policy users_platform_data_operator_select on users
  for select using (app_is_platform_data_operator());
create policy memberships_platform_data_operator_select on tenant_memberships
  for select using (app_is_platform_data_operator());
create policy companies_platform_data_operator_select on client_companies
  for select using (app_is_platform_data_operator());
create policy documents_platform_data_operator_select on documents
  for select using (app_is_platform_data_operator());
create policy payments_platform_data_operator_select on payments
  for select using (app_is_platform_data_operator());
create policy audit_platform_data_operator_select on audit_log
  for select using (app_is_platform_data_operator());
create policy client_company_memberships_platform_data_operator_select on client_company_memberships
  for select using (app_is_platform_data_operator());
create policy bank_statement_transactions_platform_data_operator_select on bank_statement_transactions
  for select using (app_is_platform_data_operator());

-- Assigned-company support threads are private to their creator. Office users
-- keep the shared tenant mailbox; platform helpdesk policies remain unchanged.
drop policy if exists support_tickets_isolation on support_tickets;
create policy support_tickets_isolation on support_tickets
  using (
    tenant_id = app_current_tenant_id()
    and (app_has_tenant_wide_access() or created_by = app_current_user_id())
  )
  with check (
    tenant_id = app_current_tenant_id()
    and created_by = app_current_user_id()
  );

drop policy if exists support_messages_isolation on support_messages;
create policy support_messages_isolation on support_messages
  using (
    tenant_id = app_current_tenant_id()
    and exists (
      select 1 from support_tickets ticket
      where ticket.id = support_messages.ticket_id
        and (app_has_tenant_wide_access() or ticket.created_by = app_current_user_id())
    )
  )
  with check (
    tenant_id = app_current_tenant_id()
    and sender_type = 'client'
    and sender_user_id = app_current_user_id()
    and exists (
      select 1 from support_tickets ticket
      where ticket.id = support_messages.ticket_id
        and (app_has_tenant_wide_access() or ticket.created_by = app_current_user_id())
    )
  );

-- Password hashes are never globally readable by platform staff. Supervisors
-- can create credentials for invited platform/tenant accounts but normal reads
-- and updates remain self-only.
drop policy if exists user_credentials_isolation on user_credentials;
create policy user_credentials_self on user_credentials
  using (user_id = app_current_user_id())
  with check (user_id = app_current_user_id());
create policy user_credentials_supervisor_insert on user_credentials
  for insert with check (app_is_supervisor());

-- A compromised route using the application role must not let a user turn
-- their own row into a platform administrator or reactivate a blocked account.
create or replace function epito_protect_user_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (
    new.email is distinct from old.email
    or new.platform_role is distinct from old.platform_role
    or new.status is distinct from old.status
    or new.deleted_at is distinct from old.deleted_at
  ) and not app_is_supervisor() then
    raise exception 'Supervisor access required for security fields' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists users_protect_security_fields on users;
create trigger users_protect_security_fields
before update on users
for each row execute function epito_protect_user_security_fields();

revoke all on function epito_protect_user_security_fields() from public;

grant select, insert, update, delete on client_company_memberships to epito_app;

-- Payment instructions needed by an assigned end client live on the payment
-- itself. This avoids granting access to the office-only issued_invoices row.
update payments payment
set metadata = payment.metadata || jsonb_strip_nulls(jsonb_build_object(
  'recipient_name', company.name,
  'bank_account_number', invoice.bank_account_number
))
from issued_invoices invoice
join client_companies company on company.id = invoice.client_company_id
where payment.document_id = invoice.document_id
  and payment.tenant_id = invoice.tenant_id
  and payment.metadata->>'source' = 'issued_invoice';

-- Login/session functions carry the authorization version and access scope.
-- auth_version is incremented whenever password, role or status changes.
drop function if exists epito_get_login_identity(text);
create function epito_get_login_identity(requested_email text)
returns table (
  user_id uuid,
  email text,
  full_name text,
  platform_role text,
  password_hash text,
  auth_version integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select user_row.id, user_row.email, user_row.full_name, user_row.platform_role,
    credentials.password_hash, user_row.auth_version
  from users user_row
  join user_credentials credentials on credentials.user_id = user_row.id
  where lower(user_row.email) = lower(trim(requested_email))
    and user_row.status = 'active'
    and user_row.deleted_at is null
  limit 1
$$;

drop function if exists epito_user_memberships();
create function epito_user_memberships()
returns table (
  tenant_id uuid,
  tenant_slug text,
  tenant_name text,
  membership_role text,
  access_scope text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tenant.id, tenant.slug, tenant.display_name, membership.role, membership.access_scope
  from tenant_memberships membership
  join tenants tenant on tenant.id = membership.tenant_id
  where membership.user_id = app_current_user_id()
    and membership.status = 'active'
    and tenant.status = 'active'
    and tenant.deleted_at is null
  order by tenant.display_name
$$;

create function epito_validate_session(
  requested_user_id uuid,
  requested_tenant_id uuid,
  requested_auth_version integer
)
returns table (
  email text,
  full_name text,
  platform_role text,
  auth_version integer,
  tenant_id uuid,
  tenant_slug text,
  tenant_name text,
  membership_role text,
  access_scope text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select user_row.email, user_row.full_name, user_row.platform_role, user_row.auth_version,
    tenant.id, tenant.slug, tenant.display_name, membership.role,
    coalesce(membership.access_scope, 'tenant')
  from users user_row
  left join tenants tenant
    on tenant.id = requested_tenant_id
   and tenant.status = 'active'
   and tenant.deleted_at is null
  left join tenant_memberships membership
    on membership.tenant_id = tenant.id
   and membership.user_id = user_row.id
   and membership.status = 'active'
  where user_row.id = requested_user_id
    and user_row.status = 'active'
    and user_row.deleted_at is null
    and user_row.auth_version = requested_auth_version
    and (
      (
        requested_tenant_id is null
        and user_row.platform_role in ('support', 'helpdesk', 'moderator', 'developer', 'admin', 'supervisor')
      )
      or (
        requested_tenant_id is not null
        and tenant.id is not null
        and (
          membership.id is not null
          or user_row.platform_role in ('developer', 'admin', 'supervisor')
        )
      )
    )
  limit 1
$$;

revoke all on function epito_get_login_identity(text) from public;
revoke all on function epito_user_memberships() from public;
revoke all on function epito_validate_session(uuid, uuid, integer) from public;
grant execute on function epito_get_login_identity(text) to epito_app;
grant execute on function epito_user_memberships() to epito_app;
grant execute on function epito_validate_session(uuid, uuid, integer) to epito_app;
