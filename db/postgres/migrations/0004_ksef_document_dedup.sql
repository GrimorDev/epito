create unique index documents_client_ksef_number_unique on documents (tenant_id, client_company_id, ksef_number)
  where ksef_number is not null and deleted_at is null;
