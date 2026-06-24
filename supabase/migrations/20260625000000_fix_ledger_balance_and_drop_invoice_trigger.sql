-- Drop legacy invoice auto-posting trigger (app posts balanced vouchers; trigger caused duplicates)
DROP TRIGGER IF EXISTS trigger_auto_balance_invoice_ledger ON public.invoices;
DROP FUNCTION IF EXISTS public.auto_balance_invoice_ledger();

-- Recalculate running balances using debit-normal (assets) vs credit-normal (liabilities/income) convention
CREATE OR REPLACE FUNCTION public.recalculate_ledger_running_balances(l_id UUID)
RETURNS VOID AS $$
DECLARE
    running_bal NUMERIC := 0;
    opening_bal NUMERIC := 0;
    ledger_type_val TEXT;
    entry_record RECORD;
    credit_normal BOOLEAN;
BEGIN
    SELECT COALESCE(opening_balance, 0), COALESCE(ledger_type, '')
    INTO opening_bal, ledger_type_val
    FROM public.ledgers
    WHERE id = l_id;

    credit_normal := lower(ledger_type_val) IN (
        'capital', 'equity', 'loan', 'payables', 'liability',
        'income', 'revenue', 'sundry creditor', 'creditor',
        'secondary loan', 'unsecured loan'
    );

    running_bal := opening_bal;

    FOR entry_record IN
        SELECT id, debit_amount, credit_amount
        FROM public.ledger_entries
        WHERE ledger_id = l_id
        ORDER BY entry_date ASC, created_at ASC
    LOOP
        IF credit_normal THEN
            running_bal := running_bal - COALESCE(entry_record.debit_amount, 0) + COALESCE(entry_record.credit_amount, 0);
        ELSE
            running_bal := running_bal + COALESCE(entry_record.debit_amount, 0) - COALESCE(entry_record.credit_amount, 0);
        END IF;

        UPDATE public.ledger_entries
        SET balance = running_bal
        WHERE id = entry_record.id;
    END LOOP;

    UPDATE public.ledgers
    SET current_balance = running_bal,
        updated_at = now()
    WHERE id = l_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-run balance recalculation for all ledgers
DO $$
DECLARE
    l RECORD;
BEGIN
    FOR l IN SELECT id FROM public.ledgers LOOP
        PERFORM public.recalculate_ledger_running_balances(l.id);
    END LOOP;
END $$;
