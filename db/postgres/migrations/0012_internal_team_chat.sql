-- 1:1 direct messages between two members of the SAME tenant's own team —
-- distinct from support_tickets (client <-> Epito staff). No platform-staff
-- visibility here at all: this is private to the two participants.
create table internal_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_a_id uuid not null references users(id),
  user_b_id uuid not null references users(id),
  user_a_last_read_at timestamptz,
  user_b_last_read_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (user_a_id <> user_b_id),
  -- Canonical ordering (smaller id first) so (A,B) and (B,A) can't both
  -- exist as separate conversations for the same pair.
  check (user_a_id < user_b_id)
);

create unique index internal_conversations_pair_unique on internal_conversations (tenant_id, user_a_id, user_b_id);
create index internal_conversations_tenant_idx on internal_conversations (tenant_id, last_message_at desc);

create table internal_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references internal_conversations(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  sender_user_id uuid not null references users(id),
  sender_name text not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index internal_messages_conversation_idx on internal_messages (conversation_id, created_at);

alter table internal_conversations enable row level security;
alter table internal_conversations force row level security;
alter table internal_messages enable row level security;
alter table internal_messages force row level security;

-- Only the two participants can see or write to their own conversation —
-- unlike support_tickets, no platform-staff bypass policy exists here at all.
create policy internal_conversations_participant on internal_conversations
  using (tenant_id = app_current_tenant_id() and (user_a_id = app_current_user_id() or user_b_id = app_current_user_id()))
  with check (tenant_id = app_current_tenant_id() and (user_a_id = app_current_user_id() or user_b_id = app_current_user_id()));

create policy internal_messages_participant on internal_messages
  using (
    tenant_id = app_current_tenant_id()
    and exists (
      select 1 from internal_conversations c
      where c.id = internal_messages.conversation_id
        and (c.user_a_id = app_current_user_id() or c.user_b_id = app_current_user_id())
    )
  )
  with check (
    tenant_id = app_current_tenant_id()
    and sender_user_id = app_current_user_id()
    and exists (
      select 1 from internal_conversations c
      where c.id = internal_messages.conversation_id
        and (c.user_a_id = app_current_user_id() or c.user_b_id = app_current_user_id())
    )
  );

grant select, insert, update on internal_conversations, internal_messages to epito_app;
