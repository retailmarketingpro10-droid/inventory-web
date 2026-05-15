-- Add return/refund invoice types to invoices table
ALTER TABLE public.invoices 
DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;

ALTER TABLE public.invoices 
ADD CONSTRAINT invoices_invoice_type_check 
CHECK (invoice_type IN ('sales', 'purchase', 'sale_return', 'purchase_return'));

-- Update gst_entries to support return transactions (only if table exists)
DO $$ 
BEGIN
    -- Check if gst_entries table exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'gst_entries'
    ) THEN
        -- Drop existing constraint if it exists
        ALTER TABLE public.gst_entries 
        DROP CONSTRAINT IF EXISTS gst_entries_transaction_type_check;

        -- Add new constraint with return types
        ALTER TABLE public.gst_entries 
        ADD CONSTRAINT gst_entries_transaction_type_check 
        CHECK (transaction_type IN ('sale', 'purchase', 'sale_return', 'purchase_return'));
    END IF;
END $$;

