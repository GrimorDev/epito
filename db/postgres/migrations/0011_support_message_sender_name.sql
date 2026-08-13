-- support_messages previously joined users to display the sender's name,
-- but a tenant member has no visibility (via RLS) into a platform staff
-- user's row — they have no tenant_memberships row for that tenant, so
-- users_isolation blocks it, and the inner join silently dropped every
-- staff reply from the client's view. Denormalize the name at write time
-- instead, avoiding any cross-role visibility dependency entirely.
alter table support_messages add column sender_name text;

update support_messages message
set sender_name = coalesce((select full_name from users where users.id = message.sender_user_id), 'Użytkownik');

alter table support_messages alter column sender_name set not null;
