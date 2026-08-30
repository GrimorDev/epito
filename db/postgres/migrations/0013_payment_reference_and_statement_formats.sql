create or replace function epito_generate_payment_reference()
returns text
language sql
volatile
as $$
  select 'EP-' || upper(encode(gen_random_bytes(10), 'hex'))
$$;

update payments
set payment_reference = epito_generate_payment_reference()
where payment_reference is null;

alter table payments alter column payment_reference set default epito_generate_payment_reference();
alter table payments alter column payment_reference set not null;

comment on column payments.payment_reference is
  'Unikalna w organizacji referencja, którą klient umieszcza w tytule przelewu.';

alter table bank_statement_transactions
  add column direction text not null default 'credit'
    check (direction in ('credit', 'debit')),
  add column external_reference text;

comment on table bank_statement_transactions is
  'Transakcje z wyciągów MT940, CAMT.053 i CSV używane do uzgadniania płatności.';
