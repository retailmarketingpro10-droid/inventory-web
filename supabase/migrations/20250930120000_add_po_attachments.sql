-- Create po_attachments table to store metadata for PO images/files
CREATE TABLE IF NOT EXISTS public.po_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  content_type TEXT,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.po_attachments ENABLE ROW LEVEL SECURITY;

-- Basic policies: users can read attachments of POs they own
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'po_attachments' AND policyname = 'Users can view their PO attachments'
  ) THEN
    CREATE POLICY "Users can view their PO attachments"
    ON public.po_attachments
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = po_attachments.po_id
          AND po.user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'po_attachments' AND policyname = 'Users can insert their PO attachments'
  ) THEN
    CREATE POLICY "Users can insert their PO attachments"
    ON public.po_attachments
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = po_attachments.po_id
          AND po.user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'po_attachments' AND policyname = 'Users can delete their PO attachments'
  ) THEN
    CREATE POLICY "Users can delete their PO attachments"
    ON public.po_attachments
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = po_attachments.po_id
          AND po.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Note: Ensure a Supabase Storage bucket named 'po-attachments' exists with appropriate public access or signed URL usage.

