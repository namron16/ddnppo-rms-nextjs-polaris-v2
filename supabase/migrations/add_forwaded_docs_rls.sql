alter table public.forwarded_documents enable row level security;

-- Recipients can see their own inbox
create policy "recipient selects own forwarded docs"
  on public.forwarded_documents for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = recipient_role
    )
  );

-- Senders can see what they sent (optional — for sent history)
create policy "sender selects own sent docs"
  on public.forwarded_documents for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = sender_role
    )
  );

-- Any authenticated user with a matching sender_role can insert
create policy "sender inserts forwarded docs"
  on public.forwarded_documents for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = sender_role
    )
  );

-- Only the recipient can update status (save / dismiss)
create policy "recipient updates status"
  on public.forwarded_documents for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = recipient_role
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role = recipient_role
    )
  );

-- No hard deletes allowed