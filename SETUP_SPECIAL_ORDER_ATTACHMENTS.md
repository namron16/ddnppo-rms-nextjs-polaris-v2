# Special Order Attachments Setup

## Problem

The app now supports multiple file attachments per special order, but the Supabase table `special_order_attachments` needs to be created first.

## Solution

### Option 1: Run the SQL Migration (Recommended)

1. Go to your **Supabase Dashboard** → **SQL Editor**
2. Click **New Query**
3. Copy and paste the contents of `supabase/migrations/create_special_order_attachments.sql`
4. Click **Run**

The table and indexes will be created automatically.

### Option 2: Manual Table Creation

If you prefer to create it manually, here's the SQL:

```sql
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
  
  CONSTRAINT fk_special_order FOREIGN KEY (special_order_id) 
    REFERENCES special_orders(id) ON DELETE CASCADE
);

CREATE INDEX idx_special_order_attachments_order_id 
  ON public.special_order_attachments(special_order_id);

CREATE INDEX idx_special_order_attachments_archived 
  ON public.special_order_attachments(archived);

CREATE INDEX idx_special_order_attachments_uploaded_at 
  ON public.special_order_attachments(uploaded_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.special_order_attachments TO anon;
GRANT SELECT, INSERT, UPDATE ON public.special_order_attachments TO authenticated;
```

## Verification

After running the migration, you should be able to:

1. Upload a file when creating a new special order
2. Upload/archive files from the special order details modal
3. See all uploaded files listed in the "Active Attachments" section

If you still see **"Failed to save attachment record"**, check the browser console (F12) for detailed Supabase error messages and verify the table was created successfully in your Supabase dashboard.

## Table Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Unique attachment ID (primary key) |
| `special_order_id` | TEXT | FK to special_orders table |
| `file_name` | TEXT | Original file name |
| `file_url` | TEXT | Supabase Storage public URL |
| `file_size` | TEXT | Human-readable size (e.g., "2.5 MB") |
| `file_type` | TEXT | File extension (e.g., "PDF", "DOCX") |
| `uploaded_at` | TIMESTAMP | When the file was uploaded |
| `uploaded_by` | TEXT | User who uploaded (currently "Admin") |
| `archived` | BOOLEAN | Soft-delete flag |
| `created_at` | TIMESTAMP | Record creation time |
