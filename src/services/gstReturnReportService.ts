import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export type GstReturnForm = 'gstr1' | 'gstr2a' | 'gstr2b' | 'gstr3b';

export interface GstEntryRecord {
  transaction_type: string;
  entity_name: string;
  invoice_number: string;
  invoice_date: string;
  taxable_amount: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_gst: number;
  total_amount: number;
  from_state: string;
  to_state: string;
  is_interstate: boolean;
}

export interface GstReturnRow {
  section: string;
  description: string;
  party_name?: string;
  invoice_number?: string;
  invoice_date?: string;
  place_of_supply?: string;
  taxable_value: number;
  rate?: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess?: number;
  total_tax: number;
  invoice_value?: number;
  supply_type?: string;
  itc_eligible?: string;
  row_type: 'header' | 'detail' | 'summary';
}

export interface GstReturnSummary {
  outputCGST: number;
  outputSGST: number;
  outputIGST: number;
  inputCGST: number;
  inputSGST: number;
  inputIGST: number;
  netCGST: number;
  netSGST: number;
  netIGST: number;
  netGSTLiability: number;
  outwardTaxable: number;
  inwardTaxable: number;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function sumTax(entries: GstEntryRecord[]) {
  return entries.reduce(
    (acc, e) => ({
      taxable: acc.taxable + (Number(e.taxable_amount) || 0),
      cgst: acc.cgst + (Number(e.cgst) || 0),
      sgst: acc.sgst + (Number(e.sgst) || 0),
      igst: acc.igst + (Number(e.igst) || 0),
      total: acc.total + (Number(e.total_gst) || 0),
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
  );
}

export async function fetchGstEntriesForPeriod(params: {
  companyName: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<GstEntryRecord[]> {
  const { data, error } = await (supabase as any)
    .from('gst_entries')
    .select(
      `
      transaction_type,
      entity_name,
      invoice_number,
      invoice_date,
      taxable_amount,
      gst_rate,
      cgst,
      sgst,
      igst,
      total_gst,
      total_amount,
      from_state,
      to_state,
      is_interstate,
      invoices!inner(company_id)
    `
    )
    .eq('invoices.company_id', params.companyName)
    .eq('user_id', params.userId)
    .gte('invoice_date', params.dateFrom)
    .lte('invoice_date', params.dateTo)
    .order('invoice_date', { ascending: true });

  if (error) {
    logger.error('fetchGstEntriesForPeriod', error);
    throw error;
  }

  return (data || []) as GstEntryRecord[];
}

function buildSummary(entries: GstEntryRecord[]): GstReturnSummary {
  const outward = entries.filter(
    (e) => e.transaction_type === 'sale' || e.transaction_type === 'sale_return'
  );
  const inward = entries.filter(
    (e) => e.transaction_type === 'purchase' || e.transaction_type === 'purchase_return'
  );

  const out = sumTax(outward);
  const inn = sumTax(inward);

  return {
    outputCGST: round2(out.cgst),
    outputSGST: round2(out.sgst),
    outputIGST: round2(out.igst),
    inputCGST: round2(inn.cgst),
    inputSGST: round2(inn.sgst),
    inputIGST: round2(inn.igst),
    netCGST: round2(out.cgst - inn.cgst),
    netSGST: round2(out.sgst - inn.sgst),
    netIGST: round2(out.igst - inn.igst),
    netGSTLiability: round2(out.total - inn.total),
    outwardTaxable: round2(out.taxable),
    inwardTaxable: round2(inn.taxable),
  };
}

function invoiceToDetailRow(
  e: GstEntryRecord,
  section: string,
  supplyType: string,
  itcEligible?: string
): GstReturnRow {
  return {
    section,
    description: supplyType,
    party_name: e.entity_name,
    invoice_number: e.invoice_number,
    invoice_date: e.invoice_date,
    place_of_supply: e.is_interstate ? e.to_state : e.from_state,
    taxable_value: round2(Number(e.taxable_amount) || 0),
    rate: round2(Number(e.gst_rate) || 0),
    igst: round2(Number(e.igst) || 0),
    cgst: round2(Number(e.cgst) || 0),
    sgst: round2(Number(e.sgst) || 0),
    total_tax: round2(Number(e.total_gst) || 0),
    invoice_value: round2(Number(e.total_amount) || 0),
    supply_type: supplyType,
    itc_eligible: itcEligible,
    row_type: 'detail',
  };
}

/** GSTR-1 — Outward supplies (sales) filed by you */
function buildGstr1Rows(entries: GstEntryRecord[]): GstReturnRow[] {
  const outward = entries.filter(
    (e) => e.transaction_type === 'sale' || e.transaction_type === 'sale_return'
  );
  const rows: GstReturnRow[] = [
    {
      section: 'GSTR-1',
      description: 'Details of outward supplies (Sales & Sale Returns)',
      taxable_value: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      total_tax: 0,
      row_type: 'header',
    },
    {
      section: '4A',
      description: 'Taxable outward supplies to registered persons (B2B)',
      taxable_value: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      total_tax: 0,
      row_type: 'header',
    },
  ];

  outward.forEach((e) => {
    const label =
      e.transaction_type === 'sale_return' ? 'Sale Return (CDNR)' : 'Taxable Supply';
    rows.push(invoiceToDetailRow(e, e.is_interstate ? '4C' : '4A', label));
  });

  const byRate = new Map<number, GstEntryRecord[]>();
  outward.forEach((e) => {
    const rate = round2(Number(e.gst_rate) || 0);
    if (!byRate.has(rate)) byRate.set(rate, []);
    byRate.get(rate)!.push(e);
  });

  rows.push({
    section: '5',
    description: 'Rate-wise summary of outward supplies',
    taxable_value: 0,
    igst: 0,
    cgst: 0,
    sgst: 0,
    total_tax: 0,
    row_type: 'header',
  });

  [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .forEach(([rate, group]) => {
      const s = sumTax(group);
      rows.push({
        section: '5',
        description: `GST @ ${rate}%`,
        taxable_value: round2(s.taxable),
        rate,
        igst: round2(s.igst),
        cgst: round2(s.cgst),
        sgst: round2(s.sgst),
        total_tax: round2(s.total),
        row_type: 'summary',
      });
    });

  return rows;
}

/** GSTR-2A — Auto-drafted inward supplies from suppliers */
function buildGstr2aRows(entries: GstEntryRecord[]): GstReturnRow[] {
  const inward = entries.filter(
    (e) => e.transaction_type === 'purchase' || e.transaction_type === 'purchase_return'
  );
  const rows: GstReturnRow[] = [
    {
      section: 'GSTR-2A',
      description: 'Inward supplies auto-populated from suppliers GSTR-1',
      taxable_value: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      total_tax: 0,
      row_type: 'header',
    },
    {
      section: 'B2B',
      description: 'Invoices from registered suppliers',
      taxable_value: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      total_tax: 0,
      row_type: 'header',
    },
  ];

  inward.forEach((e) => {
    const label =
      e.transaction_type === 'purchase_return'
        ? 'Debit Note (Purchase Return)'
        : 'Purchase Invoice';
    rows.push(invoiceToDetailRow(e, 'B2B', label, 'Yes'));
  });

  return rows;
}

/** GSTR-2B — ITC statement (static); uses books + marks ITC available */
function buildGstr2bRows(entries: GstEntryRecord[]): GstReturnRow[] {
  const inward = entries.filter(
    (e) => e.transaction_type === 'purchase' || e.transaction_type === 'purchase_return'
  );
  const rows: GstReturnRow[] = [
    {
      section: 'GSTR-2B',
      description: 'Input Tax Credit (ITC) statement — from your purchase records',
      taxable_value: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      total_tax: 0,
      row_type: 'header',
    },
    {
      section: 'ITC Available',
      description: 'Eligible ITC as per purchase invoices in this period',
      taxable_value: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      total_tax: 0,
      row_type: 'header',
    },
  ];

  inward.forEach((e) => {
    const label =
      e.transaction_type === 'purchase_return' ? 'ITC Reversal (Return)' : 'ITC Available';
    rows.push(
      invoiceToDetailRow(e, 'ITC', label, e.transaction_type === 'purchase' ? 'Available' : 'Reversed')
    );
  });

  const s = sumTax(inward);
  rows.push({
    section: 'Summary',
    description: 'Total eligible ITC for the period',
    taxable_value: round2(s.taxable),
    igst: round2(s.igst),
    cgst: round2(s.cgst),
    sgst: round2(s.sgst),
    total_tax: round2(s.total),
    row_type: 'summary',
  });

  return rows;
}

/** GSTR-3B — Monthly summary return */
function buildGstr3bRows(entries: GstEntryRecord[], summary: GstReturnSummary): GstReturnRow[] {
  const outward = entries.filter(
    (e) => e.transaction_type === 'sale' || e.transaction_type === 'sale_return'
  );
  const inward = entries.filter(
    (e) => e.transaction_type === 'purchase' || e.transaction_type === 'purchase_return'
  );
  const out = sumTax(outward);
  const inn = sumTax(inward);

  return [
    {
      section: 'GSTR-3B',
      description: 'Monthly summary return',
      taxable_value: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      total_tax: 0,
      row_type: 'header',
    },
    {
      section: '3.1',
      description: 'Details of outward supplies and inward supplies liable to reverse charge',
      taxable_value: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      total_tax: 0,
      row_type: 'header',
    },
    {
      section: '3.1(a)',
      description: 'Outward taxable supplies (other than zero rated, nil rated and exempted)',
      taxable_value: round2(out.taxable),
      igst: round2(out.igst),
      cgst: round2(out.cgst),
      sgst: round2(out.sgst),
      total_tax: round2(out.total),
      row_type: 'summary',
    },
    {
      section: '4',
      description: 'Eligible ITC',
      taxable_value: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      total_tax: 0,
      row_type: 'header',
    },
    {
      section: '4(A)(5)',
      description: 'All other ITC — purchases & purchase returns',
      taxable_value: round2(inn.taxable),
      igst: round2(inn.igst),
      cgst: round2(inn.cgst),
      sgst: round2(inn.sgst),
      total_tax: round2(inn.total),
      row_type: 'summary',
    },
    {
      section: '6.1',
      description: 'Tax payable (Output tax − ITC)',
      taxable_value: 0,
      igst: summary.netIGST,
      cgst: summary.netCGST,
      sgst: summary.netSGST,
      total_tax: summary.netGSTLiability,
      row_type: 'summary',
    },
  ];
}

export const GSTR_FORM_LABELS: Record<GstReturnForm, string> = {
  gstr1: 'GSTR-1 — Outward Supplies',
  gstr2a: 'GSTR-2A — Inward Supplies (Auto-drafted)',
  gstr2b: 'GSTR-2B — ITC Statement',
  gstr3b: 'GSTR-3B — Monthly Summary',
};

export function buildGstReturnRows(
  form: GstReturnForm,
  entries: GstEntryRecord[]
): GstReturnRow[] {
  const summary = buildSummary(entries);
  switch (form) {
    case 'gstr1':
      return buildGstr1Rows(entries);
    case 'gstr2a':
      return buildGstr2aRows(entries);
    case 'gstr2b':
      return buildGstr2bRows(entries);
    case 'gstr3b':
      return buildGstr3bRows(entries, summary);
    default:
      return buildGstr3bRows(entries, summary);
  }
}

export async function generateGstReturnReport(params: {
  companyName: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
  form: GstReturnForm;
}) {
  const entries = await fetchGstEntriesForPeriod(params);
  const summary = buildSummary(entries);
  const rows = buildGstReturnRows(params.form, entries);

  return { entries, rows, summary, form: params.form };
}
