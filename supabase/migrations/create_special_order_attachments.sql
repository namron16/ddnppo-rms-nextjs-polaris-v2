--- Create special_order_attachments table for storing individual file uploads per special order
-- Run this migration in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.special_order_attachments (
  id TEXT PRIMARY KEY,
  special_order_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size TEXT NOT NULL,
  file_type TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  uploaded_by TEXT NOT NULL DEFAULT 'Admin',
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key to special_orders table
  CONSTRAINT fk_special_order FOREIGN KEY (special_order_id) 
    REFERENCES special_orders(id) ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX idx_special_order_attachments_order_id 
  ON public.special_order_attachments(special_order_id);

CREATE INDEX idx_special_order_attachments_archived 
  ON public.special_order_attachments(archived);

CREATE INDEX idx_special_order_attachments_uploaded_at 
  ON public.special_order_attachments(uploaded_at DESC);

-- Enable RLS (Row Level Security) if needed
-- ALTER TABLE public.special_order_attachments ENABLE ROW LEVEL SECURITY;

-- Grant access to anon role (adjust as needed for your security model)
GRANT SELECT, INSERT, UPDATE ON public.special_order_attachments TO anon;
GRANT SELECT, INSERT, UPDATE ON public.special_order_attachments TO authenticated;
