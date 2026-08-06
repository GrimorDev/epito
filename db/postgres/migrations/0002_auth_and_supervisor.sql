create table user_credentials (
  user_id uuid primary key references users(id) on delete cascade,
  password_hash text not null,
  password_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function app_is_supervisor()
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
      and platform_role = 'supervisor'
      and status = 'active'
      and deleted_at is null
  )
$$;

revoke all on function app_is_supervisor() from public;
grant execute on function app_is_supervisor() to epito_app;

drop policy tenants_isolation on tenants;
create policy tenants_isolation on tenants
  using (id = app_current_tenant_id() or app_is_supervisor())
  with check (id = app_current_tenant_id() or app_is_supervisor());

drop policy memberships_isolation on tenant_memberships;
create policy memberships_isolation on tenant_memberships
  using (
    tenant_id = app_current_tenant_id()
    or user_id = app_current_user_id()
    or app_is_supervisor()
  )
  with check (tenant_id = app_current_tenant_id() or app_is_supervisor());

drop policy users_isolation on users;
create policy users_isolation on users
  using (
    id = app_current_user_id()
    or app_is_supervisor()
    or exists (
      select 1 from tenant_memberships membership
      where membership.user_id = users.id
        and membership.tenant_id = app_current_tenant_id()
    )
  )
  with check (id = app_current_user_id() or app_is_supervisor());

drop policy client_companies_isolation on client_companies;
create policy client_companies_isolation on client_companies
  using (tenant_id = app_current_tenant_id() or app_is_supervisor())
  with check (tenant_id = app_current_tenant_id() or app_is_supervisor());

drop policy documents_isolation on documents;
create policy documents_isolation on documents
  using (tenant_id = app_current_tenant_id() or app_is_supervisor())
  with check (tenant_id = app_current_tenant_id() or app_is_supervisor());

drop policy payments_isolation on payments;
create policy payments_isolation on payments
  using (tenant_id = app_current_tenant_id() or app_is_supervisor())
  with check (tenant_id = app_current_tenant_id() or app_is_supervisor());

drop policy outbox_events_isolation on outbox_events;
create policy outbox_events_isolation on outbox_events
  using (tenant_id = app_current_tenant_id() or app_is_supervisor())
  with check (tenant_id = app_current_tenant_id() or app_is_supervisor());

drop policy audit_log_isolation on audit_log;
create policy audit_log_isolation on audit_log
  using (tenant_id = app_current_tenant_id() or app_is_supervisor())
  with check (tenant_id = app_current_tenant_id() or app_is_supervisor());

alter table user_credentials enable row level security;
alter table user_credentials force row level security;

create policy user_credentials_isolation on user_credentials
  using (user_id = app_current_user_id() or app_is_supervisor())
  with check (user_id = app_current_user_id() or app_is_supervisor());

create or replace function epito_get_login_identity(requested_email text)
returns table (
  user_id uuid,
  email text,
  full_name text,
  platform_role text,
  password_hash text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select user_row.id, user_row.email, user_row.full_name, user_row.platform_role, credentials.password_hash
  from users user_row
  join user_credentials credentials on credentials.user_id = user_row.id
  where lower(user_row.email) = lower(trim(requested_email))
    and user_row.status = 'active'
    and user_row.deleted_at is null
  limit 1
$$;

create or replace function epito_user_memberships()
returns table (
  tenant_id uuid,
  tenant_slug text,
  tenant_name text,
  membership_role text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tenant.id, tenant.slug, tenant.display_name, membership.role
  from tenant_memberships membership
  join tenants tenant on tenant.id = membership.tenant_id
  where membership.user_id = app_current_user_id()
    and membership.status = 'active'
    and tenant.status = 'active'
    and tenant.deleted_at is null
  order by tenant.display_name
$$;

create or replace function epito_create_tenant_with_owner(
  requested_slug text,
  requested_legal_name text,
  requested_display_name text,
  requested_nip text,
  owner_email text,
  owner_full_name text,
  owner_password_hash text
)
returns table (tenant_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_tenant_id uuid := gen_random_uuid();
  created_user_id uuid := gen_random_uuid();
begin
  if not app_is_supervisor() then
    raise exception 'Supervisor access required' using errcode = '42501';
  end if;

  if exists (select 1 from users where lower(email) = lower(trim(owner_email)) and deleted_at is null) then
    raise exception 'User email already exists' using errcode = '23505';
  end if;

  insert into tenants (id, slug, legal_name, display_name, nip)
  values (
    created_tenant_id,
    lower(trim(requested_slug)),
    trim(requested_legal_name),
    trim(requested_display_name),
    nullif(regexp_replace(coalesce(requested_nip, ''), '[^0-9]', '', 'g'), '')
  );

  insert into users (id, email, full_name, status)
  values (created_user_id, lower(trim(owner_email)), trim(owner_full_name), 'active');

  insert into user_credentials (user_id, password_hash)
  values (created_user_id, owner_password_hash);

  insert into tenant_memberships (tenant_id, user_id, role, status)
  values (created_tenant_id, created_user_id, 'owner', 'active');

  insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (
    created_tenant_id,
    app_current_user_id(),
    'tenant.created',
    'tenant',
    created_tenant_id,
    jsonb_build_object('slug', lower(trim(requested_slug)), 'owner_user_id', created_user_id)
  );

  return query select created_tenant_id, created_user_id;
end;
$$;

create or replace function epito_create_tenant_user(
  requested_email text,
  requested_full_name text,
  requested_role text,
  requested_password_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_user_id uuid := gen_random_uuid();
  current_tenant uuid := app_current_tenant_id();
begin
  if current_tenant is null then
    raise exception 'Tenant context required' using errcode = '22023';
  end if;

  if requested_role not in ('admin', 'accountant', 'employee', 'viewer') then
    raise exception 'Invalid tenant role' using errcode = '22023';
  end if;

  if not app_is_supervisor() and not exists (
    select 1 from tenant_memberships
    where tenant_id = current_tenant
      and user_id = app_current_user_id()
      and role in ('owner', 'admin')
      and status = 'active'
  ) then
    raise exception 'Tenant administrator access required' using errcode = '42501';
  end if;

  if exists (select 1 from users where lower(email) = lower(trim(requested_email)) and deleted_at is null) then
    raise exception 'User email already exists' using errcode = '23505';
  end if;

  insert into users (id, email, full_name, status)
  values (created_user_id, lower(trim(requested_email)), trim(requested_full_name), 'active');

  insert into user_credentials (user_id, password_hash)
  values (created_user_id, requested_password_hash);

  insert into tenant_memberships (tenant_id, user_id, role, status)
  values (current_tenant, created_user_id, requested_role, 'active');

  insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (
    current_tenant,
    app_current_user_id(),
    'user.created',
    'user',
    created_user_id,
    jsonb_build_object('email', lower(trim(requested_email)), 'role', requested_role)
  );

  return created_user_id;
end;
$$;

revoke all on function epito_get_login_identity(text) from public;
revoke all on function epito_user_memberships() from public;
revoke all on function epito_create_tenant_with_owner(text, text, text, text, text, text, text) from public;
revoke all on function epito_create_tenant_user(text, text, text, text) from public;

grant execute on function epito_get_login_identity(text) to epito_app;
grant execute on function epito_user_memberships() to epito_app;
grant execute on function epito_create_tenant_with_owner(text, text, text, text, text, text, text) to epito_app;
grant execute on function epito_create_tenant_user(text, text, text, text) to epito_app;
grant select, insert, update on user_credentials to epito_app;
