import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RefreshCw } from 'lucide-react';
import { formatIndianCurrency } from '@/utils/indianBusiness';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  generateGstReturnReport,
  GSTR_FORM_LABELS,
  type GstReturnForm,
  type GstReturnRow,
  type GstReturnSummary,
} from '@/services/gstReturnReportService';

interface GstrReturnReportProps {
  companyName: string;
  dateFrom: string;
  dateTo: string;
  refreshKey?: number;
}

function formatDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN');
}

export function GstrReturnReport({
  companyName,
  dateFrom,
  dateTo,
  refreshKey = 0,
}: GstrReturnReportProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<GstReturnForm>('gstr3b');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<GstReturnRow[]>([]);
  const [summary, setSummary] = useState<GstReturnSummary | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !companyName) return;
    setLoading(true);
    try {
      const result = await generateGstReturnReport({
        companyName,
        userId: user.id,
        dateFrom,
        dateTo,
        form,
      });
      setRows(result.rows);
      setSummary(result.summary);
    } catch (error: any) {
      toast({
        title: 'GST report failed',
        description: error.message || 'Could not load GST return data',
        variant: 'destructive',
      });
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id, companyName, dateFrom, dateTo, form, toast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const detailRows = rows.filter((r) => r.row_type === 'detail');
  const showInvoiceColumns = form === 'gstr1' || form === 'gstr2a' || form === 'gstr2b';

  return (
    <div className="space-y-4">
      <Tabs value={form} onValueChange={(v) => setForm(v as GstReturnForm)}>
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-auto">
          <TabsTrigger value="gstr1" className="text-xs sm:text-sm">
            GSTR-1
          </TabsTrigger>
          <TabsTrigger value="gstr2a" className="text-xs sm:text-sm">
            GSTR-2A
          </TabsTrigger>
          <TabsTrigger value="gstr2b" className="text-xs sm:text-sm">
            GSTR-2B
          </TabsTrigger>
          <TabsTrigger value="gstr3b" className="text-xs sm:text-sm">
            GSTR-3B
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <p className="text-sm text-muted-foreground">{GSTR_FORM_LABELS[form]}</p>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading GST return…</div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Section</TableHead>
                  <TableHead>Description</TableHead>
                  {showInvoiceColumns && (
                    <>
                      <TableHead>Party</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>POS</TableHead>
                    </>
                  )}
                  <TableHead className="text-right">Taxable Value</TableHead>
                  {showInvoiceColumns && (
                    <TableHead className="text-right">Rate %</TableHead>
                  )}
                  <TableHead className="text-right">IGST</TableHead>
                  <TableHead className="text-right">CGST</TableHead>
                  <TableHead className="text-right">SGST</TableHead>
                  <TableHead className="text-right">Total Tax</TableHead>
                  {form === 'gstr2b' && <TableHead>ITC Status</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={showInvoiceColumns ? 12 : 7}
                      className="text-center text-muted-foreground py-8"
                    >
                      No GST entries for this period. Create invoices or run Sync GST.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row, i) => (
                    <TableRow
                      key={i}
                      className={
                        row.row_type === 'header'
                          ? 'bg-muted/40 font-semibold'
                          : row.row_type === 'summary'
                            ? 'bg-primary/5 font-medium'
                            : ''
                      }
                    >
                      <TableCell>{row.section}</TableCell>
                      <TableCell>{row.description}</TableCell>
                      {showInvoiceColumns && (
                        <>
                          <TableCell>{row.party_name || '—'}</TableCell>
                          <TableCell>{row.invoice_number || '—'}</TableCell>
                          <TableCell>{formatDate(row.invoice_date)}</TableCell>
                          <TableCell>{row.place_of_supply || '—'}</TableCell>
                        </>
                      )}
                      <TableCell className="text-right">
                        {row.taxable_value !== 0
                          ? formatIndianCurrency(row.taxable_value)
                          : '—'}
                      </TableCell>
                      {showInvoiceColumns && (
                        <TableCell className="text-right">
                          {row.rate != null && row.rate > 0 ? `${row.rate}%` : '—'}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        {row.igst !== 0 ? formatIndianCurrency(row.igst) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.cgst !== 0 ? formatIndianCurrency(row.cgst) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.sgst !== 0 ? formatIndianCurrency(row.sgst) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {row.total_tax !== 0 ? formatIndianCurrency(row.total_tax) : '—'}
                      </TableCell>
                      {form === 'gstr2b' && (
                        <TableCell>
                          {row.itc_eligible ? (
                            <Badge variant="outline">{row.itc_eligible}</Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {summary && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tax Summary (all forms)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Outward taxable</p>
                    <p className="font-semibold text-green-600">
                      {formatIndianCurrency(summary.outwardTaxable)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Inward taxable (ITC base)</p>
                    <p className="font-semibold">{formatIndianCurrency(summary.inwardTaxable)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Output tax (CGST+SGST+IGST)</p>
                    <p className="font-semibold text-blue-600">
                      {formatIndianCurrency(
                        summary.outputCGST + summary.outputSGST + summary.outputIGST
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Net GST payable (3B)</p>
                    <p
                      className={`font-semibold ${
                        summary.netGSTLiability >= 0 ? 'text-red-600' : 'text-green-600'
                      }`}
                    >
                      {formatIndianCurrency(summary.netGSTLiability)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-4 pt-4 border-t text-xs">
                  <div>
                    <span className="text-muted-foreground">Out CGST </span>
                    <span className="font-medium">{formatIndianCurrency(summary.outputCGST)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Out SGST </span>
                    <span className="font-medium">{formatIndianCurrency(summary.outputSGST)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Out IGST </span>
                    <span className="font-medium">{formatIndianCurrency(summary.outputIGST)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">In CGST </span>
                    <span className="font-medium">{formatIndianCurrency(summary.inputCGST)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">In SGST </span>
                    <span className="font-medium">{formatIndianCurrency(summary.inputSGST)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">In IGST </span>
                    <span className="font-medium">{formatIndianCurrency(summary.inputIGST)}</span>
                  </div>
                </div>
                {detailRows.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-3">
                    {detailRows.length} invoice line(s) in {GSTR_FORM_LABELS[form]}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
