import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCompany } from '@/contexts/CompanyContext';
import { BookOpen, Save, Wand2 } from 'lucide-react';
import {
  DEFAULT_LEDGER_MAPPING,
  LEDGER_ROLE_LABELS,
  roleToMappingKey,
  type LedgerMappingSettings,
  type LedgerRole,
} from '@/config/ledgerAccounts';
import {
  getLedgerMappingSettings,
  saveLedgerMappingSettings,
} from '@/services/accountingSettingsService';
import {
  ensureDefaultChartOfAccounts,
  fetchCompanyLedgers,
  type CompanyLedger,
} from '@/services/chartOfAccountsService';

const PRIMARY_ROLES: LedgerRole[] = [
  'sales',
  'purchase',
  'cash',
  'bank',
  'sundry_debtors',
  'sundry_creditors',
  'discount_allowed',
  'discount_received',
  'output_cgst',
  'output_sgst',
  'output_igst',
  'input_cgst',
  'input_sgst',
  'input_igst',
  'stock_in_hand',
  'capital',
];

export function InvoiceAccountingSettings() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ledgers, setLedgers] = useState<CompanyLedger[]>([]);
  const [mapping, setMapping] = useState<LedgerMappingSettings>({
    ...DEFAULT_LEDGER_MAPPING,
  });

  const load = useCallback(async () => {
    if (!user?.id || !selectedCompany?.company_name) return;
    setLoading(true);
    try {
      const [settings, ledgerList] = await Promise.all([
        getLedgerMappingSettings(user.id, selectedCompany.company_name),
        fetchCompanyLedgers(user.id, selectedCompany.company_name),
      ]);
      setMapping(settings);
      setLedgers(ledgerList);
    } finally {
      setLoading(false);
    }
  }, [user?.id, selectedCompany?.company_name]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSeedDefaults = async () => {
    if (!user?.id || !selectedCompany?.company_name) return;
    setSaving(true);
    try {
      const updated = await ensureDefaultChartOfAccounts(
        user.id,
        selectedCompany.company_name,
        mapping
      );
      setMapping(updated);
      await saveLedgerMappingSettings(user.id, selectedCompany.company_name, updated);
      setLedgers(await fetchCompanyLedgers(user.id, selectedCompany.company_name));
      toast({
        title: 'Default chart created',
        description: 'Standard Tally-style ledgers were created and mapped.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create default ledgers',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id || !selectedCompany?.company_name) return;
    setSaving(true);
    try {
      await saveLedgerMappingSettings(user.id, selectedCompany.company_name, mapping);
      toast({ title: 'Saved', description: 'Invoice & ledger mapping updated.' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const setRoleLedger = (role: LedgerRole, ledgerId: string) => {
    const key = roleToMappingKey(role);
    if (!key) return;
    setMapping((prev) => ({ ...prev, [key]: ledgerId === 'none' ? undefined : ledgerId }));
  };

  if (!selectedCompany) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Select a company to configure invoice ledger mapping.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading settings…</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Invoice & Ledger Mapping
          </CardTitle>
          <CardDescription>
            Map invoice vouchers to ledger accounts (Tally-style). Financial reports read from
            posted ledger entries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleSeedDefaults} disabled={saving}>
              <Wand2 className="h-4 w-4 mr-2" />
              Create Default Chart
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              Save Mapping
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
              <Label htmlFor="post-on-invoice">Post voucher when invoice is saved</Label>
              <Switch
                id="post-on-invoice"
                checked={mapping.postOnInvoice !== false}
                onCheckedChange={(v) => setMapping((p) => ({ ...p, postOnInvoice: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
              <Label htmlFor="post-on-payment">Post receipt/payment when payment is recorded</Label>
              <Switch
                id="post-on-payment"
                checked={mapping.postOnPayment !== false}
                onCheckedChange={(v) => setMapping((p) => ({ ...p, postOnPayment: v }))}
              />
            </div>

            {PRIMARY_ROLES.map((role) => {
              const key = roleToMappingKey(role);
              if (!key) return null;
              const value = (mapping[key] as string) || 'none';
              return (
                <div key={role} className="space-y-2">
                  <Label>{LEDGER_ROLE_LABELS[role]}</Label>
                  <Select value={value} onValueChange={(v) => setRoleLedger(role, v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select ledger" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Not mapped —</SelectItem>
                      {ledgers.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name} ({l.ledger_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>

          <p className="text-sm text-muted-foreground">
            Sales/Purchase vouchers: Dr Party or Cash/Bank, Cr Sales + Output GST (or Dr Purchase +
            Input GST, Cr Party). Payment vouchers: Dr Cash/Bank Cr Debtors (receipt) or Dr
            Creditors Cr Cash/Bank (payment).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
