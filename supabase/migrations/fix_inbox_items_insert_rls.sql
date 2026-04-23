-- Fix forwarding INSERT failures caused by missing/overly-strict RLS on inbox_items.
-- Allows client-side P1 forwarding rows to be inserted for P2-P10 recipients.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'inbox_items'
  ) THEN
    EXECUTE 'ALTER TABLE public.inbox_items ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'inbox_items'
        AND policyname = 'inbox_items_insert_forward_from_p1'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY inbox_items_insert_forward_from_p1
        ON public.inbox_items
        FOR INSERT
        TO anon, authenticated
        WITH CHECK (
          sender_id = 'P1'
          AND recipient_id IN ('P2','P3','P4','P5','P6','P7','P8','P9','P10')
          AND status IN ('unread', 'read', 'saved')
        )
      $policy$;
    END IF;
  END IF;
END $$;
