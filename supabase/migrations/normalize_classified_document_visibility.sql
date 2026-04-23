-- Normalize classified-document visibility to P2-only
-- This migration removes legacy forwarded visibility grants
-- and guarantees a baseline P2 can_view row for every classified document.

-- 1) Remove all non-P2 visibility rows for classified documents.
DELETE FROM public.document_visibility
WHERE document_type = 'classified_document'
  AND admin_id <> 'P2';

-- 2) Ensure each classified document has a P2 visibility grant.
INSERT INTO public.document_visibility (
  document_id,
  document_type,
  admin_id,
  can_view,
  granted_by,
  granted_at
)
SELECT
  cd.id,
  'classified_document',
  'P2',
  TRUE,
  NULL,
  NULL
FROM public.confidential_docs cd
ON CONFLICT (document_id, document_type, admin_id)
DO UPDATE SET
  can_view = EXCLUDED.can_view,
  granted_by = NULL,
  granted_at = NULL;
