create table account_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_company_id uuid not null,
  email text not null,
  full_name text not null,
  membership_role text not null check (membership_role in ('employee', 'viewer')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  invited_by uuid not null references users(id) on delete restrict,
  accepted_user_id uuid references users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, client_company_id)
    references client_companies(tenant_id, id) on delete cascade
);

create index account_invitations_tenant_company_idx
  on account_invitations (tenant_id, client_company_id, created_at desc);
create index account_invitations_pending_idx
  on account_invitations (expires_at)
  where status = 'pending';

alter table account_invitations enable row level security;
alter table account_invitations force row level security;

create policy account_invitations_manage on account_invitations
  using (tenant_id = app_current_tenant_id() and app_can_manage_tenant())
  with check (tenant_id = app_current_tenant_id() and app_can_manage_tenant());

grant select, insert, update on account_invitations to epito_app;

create function epito_create_client_invitation(
  requested_company_id uuid,
  requested_email text,
  requested_full_name text,
  requested_role text,
  requested_token_hash text,
  requested_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_tenant uuid := app_current_tenant_id();
  current_actor_id uuid := app_current_user_id();
  invitation_id uuid;
begin
  if current_tenant is null or current_actor_id is null or not app_can_manage_tenant() then
    raise exception 'Tenant administrator access required' using errcode = '42501';
  end if;
  if requested_role not in ('employee', 'viewer') then
    raise exception 'Invalid client role' using errcode = '22023';
  end if;
  if not exists (
    select 1 from client_companies
    where tenant_id = current_tenant and id = requested_company_id and deleted_at is null
  ) then
    raise exception 'Client company not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from users where lower(email) = lower(trim(requested_email)) and deleted_at is null) then
    raise exception 'User email already exists' using errcode = '23505';
  end if;

  update account_invitations
  set status = 'revoked', updated_at = now()
  where tenant_id = current_tenant
    and client_company_id = requested_company_id
    and lower(email) = lower(trim(requested_email))
    and status = 'pending';

  insert into account_invitations (
    tenant_id, client_company_id, email, full_name, membership_role,
    token_hash, expires_at, invited_by
  ) values (
    current_tenant, requested_company_id, lower(trim(requested_email)),
    trim(requested_full_name), requested_role, requested_token_hash,
    requested_expires_at, current_actor_id
  ) returning id into invitation_id;

  insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (
    current_tenant, current_actor_id, 'client_access.invited', 'account_invitation', invitation_id,
    jsonb_build_object('client_company_id', requested_company_id, 'email', lower(trim(requested_email)), 'role', requested_role)
  );

  return invitation_id;
end;
$$;

create function epito_accept_client_invitation(
  requested_token_hash text,
  requested_password_hash text
)
returns table (user_id uuid, email text, tenant_slug text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invitation account_invitations%rowtype;
  created_user_id uuid := gen_random_uuid();
  selected_tenant_slug text;
begin
  select * into invitation
  from account_invitations
  where token_hash = requested_token_hash
  for update;

  if invitation.id is null or invitation.status <> 'pending' then
    raise exception 'Invitation is invalid' using errcode = '22023';
  end if;
  if invitation.expires_at <= now() then
    update account_invitations set status = 'expired', updated_at = now() where id = invitation.id;
    raise exception 'Invitation has expired' using errcode = '22023';
  end if;
  if exists (select 1 from users where lower(users.email) = lower(invitation.email) and deleted_at is null) then
    raise exception 'User email already exists' using errcode = '23505';
  end if;

  insert into users (id, email, full_name, status)
  values (created_user_id, invitation.email, invitation.full_name, 'active');
  insert into user_credentials (user_id, password_hash)
  values (created_user_id, requested_password_hash);
  insert into tenant_memberships (tenant_id, user_id, role, status, access_scope)
  values (invitation.tenant_id, created_user_id, invitation.membership_role, 'active', 'assigned_companies');
  insert into client_company_memberships (tenant_id, client_company_id, user_id, role, status)
  values (
    invitation.tenant_id, invitation.client_company_id, created_user_id,
    case when invitation.membership_role = 'employee' then 'member' else 'viewer' end,
    'active'
  );

  update account_invitations
  set status = 'accepted', accepted_user_id = created_user_id,
      accepted_at = now(), updated_at = now()
  where id = invitation.id;

  insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (
    invitation.tenant_id, created_user_id, 'client_access.accepted', 'user', created_user_id,
    jsonb_build_object('client_company_id', invitation.client_company_id, 'invitation_id', invitation.id)
  );

  select slug into selected_tenant_slug from tenants where id = invitation.tenant_id;
  return query select created_user_id, invitation.email, selected_tenant_slug;
end;
$$;

revoke all on function epito_create_client_invitation(uuid, text, text, text, text, timestamptz) from public;
revoke all on function epito_accept_client_invitation(text, text) from public;
grant execute on function epito_create_client_invitation(uuid, text, text, text, text, timestamptz) to epito_app;
grant execute on function epito_accept_client_invitation(text, text) to epito_app;
