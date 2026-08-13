-- Support ticket threads between a tenant's own team and Epito staff.
-- Ticket-per-topic model (not one continuous channel): a tenant member opens
-- a ticket with a subject, the office (any platform staff, Helpdesk and up)
-- replies without needing to impersonate the tenant first.
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null references users(id),
  last_message_at timestamptz not null default now(),
  last_message_by text not null default 'client' check (last_message_by in ('client', 'staff')),
  client_last_read_at timestamptz not null default now(),
  staff_last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_tenant_idx on support_tickets (tenant_id, last_message_at desc);
create index support_tickets_status_idx on support_tickets (status, last_message_at desc);

create table support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  sender_user_id uuid not null references users(id),
  sender_type text not null check (sender_type in ('client', 'staff')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index support_messages_ticket_idx on support_messages (ticket_id, created_at);

alter table support_tickets enable row level security;
alter table support_tickets force row level security;
alter table support_messages enable row level security;
alter table support_messages force row level security;

-- Tenant members: owner/admin/accountant/employee only, enforced at the
-- application layer (lib/tenant-access.ts) since membershipRole isn't cheap
-- to check from RLS alone. Viewer never reaches these endpoints in the API
-- routes, so it never opens a withTenantTransaction with a matching
-- app.current_tenant_id for these tables in the first place.
create policy support_tickets_isolation on support_tickets
  using (tenant_id = app_current_tenant_id())
  with check (tenant_id = app_current_tenant_id() and created_by = app_current_user_id());

create policy support_messages_isolation on support_messages
  using (tenant_id = app_current_tenant_id())
  with check (tenant_id = app_current_tenant_id() and sender_type = 'client' and sender_user_id = app_current_user_id());

-- Platform staff (helpdesk and up): read every tenant's tickets/messages and
-- reply, without impersonating the tenant first. Deliberately broader than
-- canEditTenantData (which restricts helpdesk/moderator to read-only on a
-- tenant's financial/document data) — replying to a client's support message
-- is core helpdesk work, not tenant-data editing.
create policy support_tickets_staff_select on support_tickets
  for select using (app_is_platform_staff());

create policy support_tickets_staff_update on support_tickets
  for update using (app_is_platform_staff()) with check (app_is_platform_staff());

create policy support_messages_staff_select on support_messages
  for select using (app_is_platform_staff());

create policy support_messages_staff_insert on support_messages
  for insert with check (app_is_platform_staff() and sender_type = 'staff' and sender_user_id = app_current_user_id());

grant select, insert, update on support_tickets, support_messages to epito_app;
