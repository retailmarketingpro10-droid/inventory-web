-- Function to sequential recalculate ledger running balances
-- This fixes the issue of totals vs entry-by-entry running balance

CREATE OR REPLACE FUNCTION public.recalculate_ledger_running_balances(l_id UUID)
RETURNS VOID AS $$
DECLARE
    running_bal NUMERIC := 0;
    opening_bal NUMERIC := 0;
    entry_record RECORD;
BEGIN
    -- 1. Get opening balance for the ledger
    SELECT COALESCE(opening_balance, 0) INTO opening_bal 
    FROM public.ledgers 
    WHERE id = l_id;
    
    running_bal := opening_bal;
    
    -- 2. Loop through all entries for this ledger
    -- Sequential processing ordered by entry_date and created_at
    FOR entry_record IN 
        SELECT id, debit_amount, credit_amount 
        FROM public.ledger_entries 
        WHERE ledger_id = l_id 
        ORDER BY entry_date ASC, created_at ASC 
    LOOP
        -- Formula: previous_balance - debit + credit
        running_bal := running_bal - entry_record.debit_amount + entry_record.credit_amount;
        
        -- Update the individual entry's running balance
        UPDATE public.ledger_entries 
        SET balance = running_bal 
        WHERE id = entry_record.id;
    END LOOP;
    
    -- 3. Update the overall current_balance in the ledgers table
    UPDATE public.ledgers 
    SET current_balance = running_bal,
        updated_at = now()
    WHERE id = l_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Updated trigger function to handle any ledger modification
CREATE OR REPLACE FUNCTION public.trigger_ledger_recalculation()
RETURNS TRIGGER AS $$
DECLARE
    target_ledger_id UUID;
BEGIN
    target_ledger_id := COALESCE(NEW.ledger_id, OLD.ledger_id);
    
    IF target_ledger_id IS NOT NULL THEN
        PERFORM public.recalculate_ledger_running_balances(target_ledger_id);
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-creating the trigger to ensure it uses the new sequential logic
DROP TRIGGER IF EXISTS trigger_update_ledger_balance ON public.ledger_entries;
CREATE TRIGGER trigger_update_ledger_balance
AFTER INSERT OR UPDATE OR DELETE ON public.ledger_entries
FOR EACH ROW
EXECUTE FUNCTION public.trigger_ledger_recalculation();

-- One-time recalculation for all existing ledgers to fix current data
DO $$
DECLARE
    l RECORD;
BEGIN
    FOR l IN SELECT id FROM public.ledgers LOOP
        PERFORM public.recalculate_ledger_running_balances(l.id);
    END LOOP;
END $$;
