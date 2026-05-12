alter table public.forwarded_attachments enable row level security;

-- Readable if you are the recipient of the parent forwarded document
create policy "recipient selects attachments"
  on public.forwarded_attachments for select
  using (
    exists (
      select 1
      from public.forwarded_documents fd
      join public.profiles p on p.id = auth.uid()
      where fd.id = forwarded_document_id
        and p.role = fd.recipient_role
    )
  );

-- Insertable if you are the sender of the parent forwarded document
create policy "sender inserts attachments"
  on public.forwarded_attachments for insert
  with check (
    exists (
      select 1
      from public.forwarded_documents fd
      join public.profiles p on p.id = auth.uid()
      where fd.id = forwarded_document_id
        and p.role = fd.sender_role
    )
  );