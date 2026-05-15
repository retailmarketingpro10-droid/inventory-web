-- 1. Add discount columns to invoice_items
ALTER TABLE public.invoice_items 
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS base_price DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) DEFAULT 0;

-- 2. Create an auto-balancing ledger trigger function for Invoices
CREATE OR REPLACE FUNCTION auto_balance_invoice_ledger()
RETURNS TRIGGER AS $$
DECLARE
  v_cash_ledger_id UUID;
  v_receivables_ledger_id UUID;
  v_payables_ledger_id UUID;
  v_sales_ledger_id UUID;
  v_purchase_ledger_id UUID;
  v_discount_allowed_ledger_id UUID;
  v_discount_received_ledger_id UUID;
  
  v_debit_ledger_id UUID;
  v_credit_ledger_id UUID;
  v_discount_ledger_id UUID;
  
  v_tx_id UUID;
  v_financial_year TEXT;
BEGIN
  -- Determine Financial Year string (e.g. FY 2025-26)
  IF EXTRACT(MONTH FROM NEW.invoice_date::DATE) >= 4 THEN
    v_financial_year := 'FY ' || EXTRACT(YEAR FROM NEW.invoice_date::DATE)::TEXT || '-' || SUBSTRING((EXTRACT(YEAR FROM NEW.invoice_date::DATE) + 1)::TEXT, 3, 2);
  ELSE
    v_financial_year := 'FY ' || (EXTRACT(YEAR FROM NEW.invoice_date::DATE) - 1)::TEXT || '-' || SUBSTRING(EXTRACT(YEAR FROM NEW.invoice_date::DATE)::TEXT, 3, 2);
  END IF;

  -- Lookup standard ledgers for this company/user
  SELECT id INTO v_cash_ledger_id FROM public.ledgers WHERE company_id = NEW.company_id AND user_id = NEW.user_id AND ledger_type = 'cash' LIMIT 1;
  SELECT id INTO v_receivables_ledger_id FROM public.ledgers WHERE company_id = NEW.company_id AND user_id = NEW.user_id AND ledger_type = 'receivables' LIMIT 1;
  SELECT id INTO v_payables_ledger_id FROM public.ledgers WHERE company_id = NEW.company_id AND user_id = NEW.user_id AND ledger_type = 'payables' LIMIT 1;
  SELECT id INTO v_sales_ledger_id FROM public.ledgers WHERE company_id = NEW.company_id AND user_id = NEW.user_id AND ledger_type = 'income' LIMIT 1;
  SELECT id INTO v_purchase_ledger_id FROM public.ledgers WHERE company_id = NEW.company_id AND user_id = NEW.user_id AND ledger_type = 'expense' LIMIT 1;
  
  -- Create Discount Ledgers if they don't exist
  SELECT id INTO v_discount_allowed_ledger_id FROM public.ledgers WHERE company_id = NEW.company_id AND user_id = NEW.user_id AND name ILIKE '%Discount Allowed%' LIMIT 1;
  
  IF v_discount_allowed_ledger_id IS NULL THEN
    INSERT INTO public.ledgers (name, ledger_type, company_id, user_id, current_balance, opening_balance, financial_year)
    VALUES ('Discount Allowed', 'expense', NEW.company_id, NEW.user_id, 0, 0, v_financial_year)
    RETURNING id INTO v_discount_allowed_ledger_id;
  END IF;

  SELECT id INTO v_discount_received_ledger_id FROM public.ledgers WHERE company_id = NEW.company_id AND user_id = NEW.user_id AND name ILIKE '%Discount Received%' LIMIT 1;
  
  IF v_discount_received_ledger_id IS NULL THEN
    INSERT INTO public.ledgers (name, ledger_type, company_id, user_id, current_balance, opening_balance, financial_year)
    VALUES ('Discount Received', 'income', NEW.company_id, NEW.user_id, 0, 0, v_financial_year)
    RETURNING id INTO v_discount_received_ledger_id;
  END IF;

  -- Create a Ledger Transaction reference
  INSERT INTO public.ledger_transactions (transaction_date, description, company_id, financial_year, user_id)
  VALUES (NEW.invoice_date::DATE, 'Invoice ' || NEW.invoice_number || ' (' || NEW.invoice_type || ')', NEW.company_id, v_financial_year, NEW.user_id)
  RETURNING id INTO v_tx_id;

  -- If updating an old invoice, create Reversal Entries... (Simplified for now, focusing on insert balancing)
  
  IF NEW.invoice_type = 'sales' THEN
    v_debit_ledger_id := CASE WHEN NEW.payment_status = 'paid' THEN COALESCE(v_cash_ledger_id, v_receivables_ledger_id) ELSE COALESCE(v_receivables_ledger_id, v_cash_ledger_id) END;
    v_credit_ledger_id := v_sales_ledger_id;
    v_discount_ledger_id := v_discount_allowed_ledger_id;
    
    -- Cash/Receivable Asset (Net amount)
    IF v_debit_ledger_id IS NOT NULL THEN
      INSERT INTO public.ledger_entries (ledger_id, entry_date, description, debit_amount, credit_amount, financial_year, user_id, transaction_id)
      VALUES (v_debit_ledger_id, NEW.invoice_date::DATE, 'Sale Invoice ' || NEW.invoice_number, NEW.total_amount, 0, v_financial_year, NEW.user_id, v_tx_id);
    END IF;
    
    -- Discount Allowed Expense (Discount amount)
    IF v_discount_ledger_id IS NOT NULL AND COALESCE(NEW.discount_amount, 0) > 0 THEN
      INSERT INTO public.ledger_entries (ledger_id, entry_date, description, debit_amount, credit_amount, financial_year, user_id, transaction_id)
      VALUES (v_discount_ledger_id, NEW.invoice_date::DATE, 'Discount Allowed ' || NEW.invoice_number, NEW.discount_amount, 0, v_financial_year, NEW.user_id, v_tx_id);
    END IF;

    -- Revenue (Gross subtotal + tax = total + discount)
    IF v_credit_ledger_id IS NOT NULL THEN
      INSERT INTO public.ledger_entries (ledger_id, entry_date, description, debit_amount, credit_amount, financial_year, user_id, transaction_id)
      VALUES (v_credit_ledger_id, NEW.invoice_date::DATE, 'Sale Invoice ' || NEW.invoice_number, 0, NEW.total_amount + COALESCE(NEW.discount_amount, 0), v_financial_year, NEW.user_id, v_tx_id);
    END IF;
  
  ELSIF NEW.invoice_type = 'purchase' THEN
    v_credit_ledger_id := CASE WHEN NEW.payment_status = 'paid' THEN COALESCE(v_cash_ledger_id, v_payables_ledger_id) ELSE COALESCE(v_payables_ledger_id, v_cash_ledger_id) END;
    v_debit_ledger_id := v_purchase_ledger_id;
    v_discount_ledger_id := v_discount_received_ledger_id;
    
    -- Expense Account (Gross amount)
    IF v_debit_ledger_id IS NOT NULL THEN
      INSERT INTO public.ledger_entries (ledger_id, entry_date, description, debit_amount, credit_amount, financial_year, user_id, transaction_id)
      VALUES (v_debit_ledger_id, NEW.invoice_date::DATE, 'Purchase Invoice ' || NEW.invoice_number, NEW.total_amount + COALESCE(NEW.discount_amount, 0), 0, v_financial_year, NEW.user_id, v_tx_id);
    END IF;
    
    -- Discount Received Income (Discount amount)
    IF v_discount_ledger_id IS NOT NULL AND COALESCE(NEW.discount_amount, 0) > 0 THEN
      INSERT INTO public.ledger_entries (ledger_id, entry_date, description, debit_amount, credit_amount, financial_year, user_id, transaction_id)
      VALUES (v_discount_ledger_id, NEW.invoice_date::DATE, 'Discount Received ' || NEW.invoice_number, 0, NEW.discount_amount, v_financial_year, NEW.user_id, v_tx_id);
    END IF;

    -- Liability/Cash Account (Net amount)
    IF v_credit_ledger_id IS NOT NULL THEN
      INSERT INTO public.ledger_entries (ledger_id, entry_date, description, debit_amount, credit_amount, financial_year, user_id, transaction_id)
      VALUES (v_credit_ledger_id, NEW.invoice_date::DATE, 'Purchase Invoice ' || NEW.invoice_number, 0, NEW.total_amount, v_financial_year, NEW.user_id, v_tx_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger to invoices 
DROP TRIGGER IF EXISTS trigger_auto_balance_invoice_ledger ON public.invoices;
CREATE TRIGGER trigger_auto_balance_invoice_ledger
AFTER INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION auto_balance_invoice_ledger();
