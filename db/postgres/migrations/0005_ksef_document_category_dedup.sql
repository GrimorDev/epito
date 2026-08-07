drop index if exists documents_client_ksef_number_unique;

create unique index documents_client_ksef_number_category_unique on documents (tenant_id, client_company_id, ksef_number, category)
  where ksef_number is not null and deleted_at is null;
