-- Fix status on auto-posted voucher lines (default was incorrectly 'due' for all entries)

-- Book entries from system vouchers are settled postings
UPDATE public.ledger_entries
SET status = 'paid'
WHERE transaction_id IS NOT NULL;

-- Outstanding party (debtor/creditor) lines follow invoice payment_status
UPDATE public.ledger_entries le
SET status = i.payment_status
FROM public.ledger_transactions lt
JOIN public.invoices i ON i.id = lt.invoice_id
WHERE le.transaction_id = lt.id
  AND le.debit_amount > 0
  AND lt.voucher_type IN ('sales', 'purchase', 'credit_note', 'debit_note')
  AND i.payment_status IN ('paid', 'due', 'partial');

-- Receipt/payment settlement lines are always paid
UPDATE public.ledger_entries le
SET status = 'paid'
FROM public.ledger_transactions lt
WHERE le.transaction_id = lt.id
  AND lt.voucher_type IN ('receipt', 'payment');
