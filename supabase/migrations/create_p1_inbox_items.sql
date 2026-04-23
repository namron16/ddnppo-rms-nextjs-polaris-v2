-- Create P1 inbox table for forwarded files and attachments
-- This stores items forwarded by other roles into the P1 / Records Officer inbox.

CREATE TABLE IF NOT EXISTS public.p1_inbox_items (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL DEFAULT 'P1',
  sender_id TEXT NOT NULL,
  item_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size TEXT NOT NULL,
  file_type TEXT NOT NULL,
  source_document_id TEXT,
  source_attachment_id TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  archived_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_p1_inbox_items_recipient_created_at
  ON public.p1_inbox_items(recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_p1_inbox_items_status
  ON public.p1_inbox_items(status);

CREATE INDEX IF NOT EXISTS idx_p1_inbox_items_sender_id
  ON public.p1_inbox_items(sender_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.p1_inbox_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.p1_inbox_items TO authenticated;