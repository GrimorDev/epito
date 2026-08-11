alter table issued_invoices
  drop constraint if exists issued_invoices_status_check;

alter table issued_invoices
  add constraint issued_invoices_status_check
  check (status in ('draft', 'queued', 'submitted', 'accepted', 'rejected', 'failed', 'cancelled'));
