import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { useSubscription } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';
import { formatIndianCurrency } from '@/utils/indianBusiness';
import { DateInput } from '@/components/ui/date-input';
import { Coffee, Plus, Receipt, Wallet } from 'lucide-react';
import { fetchCompanyLedgers } from '@/services/chartOfAccountsService';
import {
  getLedgerMappingSettings,
} from '@/services/accountingSettingsService';
import {
  createExpenseLedger,
  fetchRecentPettyExpenses,
  postPettyExpense,
  type PettyExpenseRow,
} from '@/services/pettyExpenseService';
import { logger } from '@/lib/logger';

const QUICK_EXPENSE_PRESETS = [
  'Tea & Refreshments',
  'Miscellaneous Expenses',
  'Office Supplies',
  'Courier & Postage',
];

function isExpenseLedgerType(type: string) {
  const t = (type || '').toLowerCase();
  return t === 'expense' || t === 'expenses';
}

function isPaymentLedgerType(type: string) {
  const t = (type || '').toLowerCase();
  return t === 'cash' || t === 'bank';
}

export function PettyExpenseManager() {
  const { selectedCompany } = useCompany();
  const { isReadOnly } = useSubscription();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ledgers, setLedgers] = useState<
    Array<{ id: string; name: string; ledger_type: string }>
  >([]);
  const [recent, setRecent] = useState<PettyExpenseRow[]>([]);
  const [showNewLedger, setShowNewLedger] = useState(false);
  const [newLedgerName, setNewLedgerName] = useState('');

  const [form, setForm] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    expense_ledger_id: '',
    payment_ledger_id: '',
  });

  const loadData = useCallback(async () => {
    if (!selectedCompany?.company_name) {
      setLedgers([]);
      setRecent([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;

      const [ledgerList, mapping, expenses] = await Promise.all([
        fetchCompanyLedgers(user.id, selectedCompany.company_name),
        getLedgerMappingSettings(user.id, selectedCompany.company_name),
        fetchRecentPettyExpenses({
          userId: user.id,
          companyId: selectedCompany.company_name,
        }),
      ]);

      setLedgers(ledgerList);
      setRecent(expenses);

      const defaultPayment =
        mapping.cashAccountId &&
        ledgerList.some((l) => l.id === mapping.cashAccountId)
          ? mapping.cashAccountId
          : ledgerList.find((l) => isPaymentLedgerType(l.ledger_type))?.id || '';

      setForm((prev) => ({
        ...prev,
        payment_ledger_id: prev.payment_ledger_id || defaultPayment,
      }));
    } catch (error) {
      logger.error('PettyExpenseManager load:', error);
      toast({
        title: 'Error',
        description: 'Failed to load petty expense data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany?.company_name, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const expenseLedgers = useMemo(
    () =>
      ledgers.filter(
        (l) =>
          isExpenseLedgerType(l.ledger_type) &&
          l.name.toLowerCase() !== 'purchase account'
      ),
    [ledgers]
  );

  const paymentLedgers = useMemo(
    () => ledgers.filter((l) => isPaymentLedgerType(l.ledger_type)),
    [ledgers]
  );

  const monthTotal = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    return recent
      .filter((row) => {
        const d = new Date(row.entry_date);
        return d.getMonth() === month && d.getFullYear() === year;
      })
      .reduce((sum, row) => sum + row.amount, 0);
  }, [recent]);

  const handleCreateLedger = async (presetName?: string) => {
    const name = (presetName || newLedgerName).trim();
    if (!name || !selectedCompany?.company_name) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Not authenticated');

      const created = await createExpenseLedger({
        userId: user.id,
        companyId: selectedCompany.company_name,
        name,
      });

      await loadData();
      setForm((prev) => ({ ...prev, expense_ledger_id: created.id }));
      setShowNewLedger(false);
      setNewLedgerName('');
      toast({
        title: 'Expense ledger ready',
        description: `"${created.name}" can be used for petty expenses.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create ledger',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany?.company_name || isReadOnly) return;

    const amount = Number(form.amount);
    if (!form.expense_ledger_id) {
      toast({
        title: 'Select expense account',
        description: 'Choose or create an expense ledger (e.g. Tea & Refreshments).',
        variant: 'destructive',
      });
      return;
    }
    if (!form.payment_ledger_id) {
      toast({
        title: 'Select payment account',
        description: 'Choose Cash or Bank to pay from.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Not authenticated');

      const result = await postPettyExpense({
        companyId: selectedCompany.company_name,
        userId: user.id,
        entryDate: form.entry_date,
        description: form.description,
        amount,
        expenseLedgerId: form.expense_ledger_id,
        paymentLedgerId: form.payment_ledger_id,
      });

      toast({
        title: 'Petty expense recorded',
        description: `${formatIndianCurrency(amount)} posted (${result.referenceNumber}).`,
      });

      setForm((prev) => ({
        ...prev,
        description: '',
        amount: '',
      }));
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Could not save',
        description: error.message || 'Failed to post petty expense',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!selectedCompany) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Select a company to record petty expenses.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>This month</CardDescription>
            <CardTitle className="text-2xl">{formatIndianCurrency(monthTotal)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Recent entries</CardDescription>
            <CardTitle className="text-2xl">{recent.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expense accounts</CardDescription>
            <CardTitle className="text-2xl">{expenseLedgers.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Record Petty Expense
          </CardTitle>
          <CardDescription>
            Posts one balanced voucher: debit expense, credit cash/bank. Updates Trial
            Balance, P&amp;L, and Balance Sheet automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pe-date">Date</Label>
                <DateInput
                  id="pe-date"
                  value={form.entry_date}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, entry_date: value }))
                  }
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pe-amount">Amount (₹)</Label>
                <Input
                  id="pe-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="200"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  disabled={isReadOnly}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pe-description">Description</Label>
              <Textarea
                id="pe-description"
                placeholder="Office tea, stationery, courier, etc."
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                disabled={isReadOnly}
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Expense account</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setShowNewLedger(true)}
                    disabled={isReadOnly}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    New account
                  </Button>
                </div>
                <Select
                  value={form.expense_ledger_id}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, expense_ledger_id: value }))
                  }
                  disabled={isReadOnly}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select expense account" />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseLedgers.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No expense accounts — create one
                      </SelectItem>
                    ) : (
                      expenseLedgers.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-2 pt-1">
                  {QUICK_EXPENSE_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={isReadOnly}
                      onClick={() => handleCreateLedger(preset)}
                    >
                      <Coffee className="h-3 w-3 mr-1" />
                      {preset}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Paid from</Label>
                <Select
                  value={form.payment_ledger_id}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, payment_ledger_id: value }))
                  }
                  disabled={isReadOnly}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Cash or Bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentLedgers.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No Cash/Bank ledger found
                      </SelectItem>
                    ) : (
                      paymentLedgers.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name} ({l.ledger_type})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Accounting entry</p>
              <p>Dr selected expense account · Cr Cash/Bank — same amount, one voucher.</p>
            </div>

            <Button type="submit" disabled={saving || isReadOnly || loading}>
              <Receipt className="h-4 w-4 mr-2" />
              {saving ? 'Posting…' : 'Save Petty Expense'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Petty Expenses</CardTitle>
          <CardDescription>Payment vouchers posted from this screen</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-6 text-muted-foreground">Loading…</p>
          ) : recent.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">
              No petty expenses recorded yet.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Expense</TableHead>
                    <TableHead>Paid from</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        {new Date(row.entry_date).toLocaleDateString('en-IN')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {row.reference_number || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell>{row.expense_ledger_name || '—'}</TableCell>
                      <TableCell>{row.payment_ledger_name || '—'}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatIndianCurrency(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showNewLedger} onOpenChange={setShowNewLedger}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New expense account</DialogTitle>
            <DialogDescription>
              Creates an indirect expense ledger for petty costs (tea, misc, etc.).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-expense-ledger">Account name</Label>
            <Input
              id="new-expense-ledger"
              value={newLedgerName}
              onChange={(e) => setNewLedgerName(e.target.value)}
              placeholder="e.g. Tea & Refreshments"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewLedger(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => handleCreateLedger()}
              disabled={!newLedgerName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
