-- Create storage bucket for PO attachments and add policies

-- Create bucket if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'po-attachments'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('po-attachments', 'po-attachments', true);
  END IF;
END $$;

-- Policies on storage.objects for this bucket
-- Allow anyone to read objects in this bucket (public bucket). Adjust if you prefer signed URLs only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'po_attachments_read'
  ) THEN
    CREATE POLICY "po_attachments_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'po-attachments');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'po_attachments_insert'
  ) THEN
    CREATE POLICY "po_attachments_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'po-attachments' AND auth.role() = 'authenticated'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'po_attachments_update'
  ) THEN
    CREATE POLICY "po_attachments_update"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'po-attachments' AND owner = auth.uid()
    )
    WITH CHECK (
      bucket_id = 'po-attachments' AND owner = auth.uid()
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'po_attachments_delete'
  ) THEN
    CREATE POLICY "po_attachments_delete"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'po-attachments' AND owner = auth.uid()
    );
  END IF;
END $$;


