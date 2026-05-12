-- master_document_attachments
-- NOTE: master_document_id is text (not uuid) to match master_documents.id
create table if not exists public.master_document_attachments (
  id                  uuid        primary key default gen_random_uuid(),
  master_document_id  text        not null
                        references public.master_documents(id)
                        on delete cascade,
  parent_id           text,                    -- null = direct child of root document
  depth               int         not null default 0,
  title               text        not null,
  file_name           text,
  file_size_bytes     bigint,
  mime_type           text,
  gdrive_file_id      text        not null,
  gdrive_url          text        not null,
  pool_account_id     text        not null,
  created_at          timestamptz not null default now()
);

create index if not exists idx_mda_document on public.master_document_attachments(master_document_id);
create index if not exists idx_mda_parent   on public.master_document_attachments(parent_id);


-- special_order_attachments
-- NOTE: special_order_id is text (not uuid) to match special_orders.id
create table if not exists public.special_order_attachments (
  id                  uuid        primary key default gen_random_uuid(),
  special_order_id      text        not null
                        references public.special_orders(id)
                        on delete cascade,
  parent_id           text,
  depth               int         not null default 0,
  title               text        not null,
  file_name           text,
  file_size_bytes     bigint,
  mime_type           text,
  gdrive_file_id      text        not null,
  gdrive_url          text        not null,
  pool_account_id     text        not null,
  created_at          timestamptz not null default now()
);

create index if not exists idx_soa_document on public.special_order_attachments(special_order_id);
create index if not exists idx_soa_parent   on public.special_order_attachments(parent_id);


-- daily_journal_attachments
-- NOTE: daily_journal_id is text (not uuid) to match daily_journals.id
create table if not exists public.daily_journal_attachments (
  id                  uuid        primary key default gen_random_uuid(),
  daily_journal_id    text        not null
                        references public.daily_journals(id)
                        on delete cascade,
  parent_id           text,
  depth               int         not null default 0,
  title               text        not null,
  file_name           text,
  file_size_bytes     bigint,
  mime_type           text,
  gdrive_file_id      text        not null,
  gdrive_url          text        not null,
  pool_account_id     text        not null,
  created_at          timestamptz not null default now()
);

create index if not exists idx_dja_document on public.daily_journal_attachments(daily_journal_id);
create index if not exists idx_dja_parent   on public.daily_journal_attachments(parent_id);


-- library_item_attachments
-- NOTE: library_item_id is text (not uuid) to match library_items.id
create table if not exists public.library_item_attachments (
  id                    uuid        primary key default gen_random_uuid(),
  library_item_id   text        not null
                          references public.library_items(id)
                          on delete cascade,
  parent_id             text,
  depth                 int         not null default 0,
  title                 text        not null,
  file_name             text,
  file_size_bytes       bigint,
  mime_type             text,
  gdrive_file_id        text        not null,
  gdrive_url            text        not null,
  pool_account_id       text        not null,
  created_at            timestamptz not null default now()
);

create index if not exists idx_lia_document on public.library_item_attachments(library_item_id);
create index if not exists idx_lia_parent   on public.library_item_attachments(parent_id);