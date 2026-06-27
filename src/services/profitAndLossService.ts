import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export interface ProfitAndLossParams {
  companyName: string;
  dateFrom: string;
  dateTo: string;
  toast?: (opts: { title: string; description?: string; variant?: string }) => void;
}

export interface ProfitAndLossResult {
  rows: any[];
  summary: any;
}

export async function generateProfitAndLossReport(
  params: ProfitAndLossParams
): Promise<ProfitAndLossResult> {
  const { companyName, dateFrom, dateTo } = params;

  // The implementation here is a direct extraction of the existing
  // profit-loss logic from ReportsManager, but parameterised so it
  // can be reused and tested independently.

  // Fetch all sales invoices (for sales account) within the reporting period
  const { data: allSalesInvoices, error: salesError } = await (supabase as any).from("invoices")
    .select("id, subtotal, tax_amount, total_amount, invoice_date")
    .eq("company_id", companyName)
    .eq("invoice_type", "sales")
    .gte("invoice_date", dateFrom)
    .lte("invoice_date", dateTo);

  if (salesError) {
    logger.error("Error fetching sales invoices:", salesError);
  }

  // Fetch sale return invoices in the reporting period
  const { data: saleReturns } = await (supabase as any).from("invoices")
    .select("id, subtotal, tax_amount, total_amount, invoice_date")
    .eq("company_id", companyName)
    .eq("invoice_type", "sale_return")
    .gte("invoice_date", dateFrom)
    .lte("invoice_date", dateTo);

  // Fetch purchase invoices in the reporting period
  const { data: purchaseInvoices, error: purchaseError } = await (supabase as any).from("invoices")
    .select("id, subtotal, tax_amount, total_amount, invoice_date")
    .eq("company_id", companyName)
    .eq("invoice_type", "purchase")
    .gte("invoice_date", dateFrom)
    .lte("invoice_date", dateTo);

  if (purchaseError) {
    logger.error("Error fetching purchase invoices:", purchaseError);
  }

  // Fetch purchase return invoices in the reporting period
  const { data: purchaseReturns } = await (supabase as any).from("invoices")
    .select("id, subtotal, tax_amount, total_amount, invoice_date")
    .eq("company_id", companyName)
    .eq("invoice_type", "purchase_return")
    .gte("invoice_date", dateFrom)
    .lte("invoice_date", dateTo);

  // Fetch invoices AFTER the reporting period for backward stock calculation
  const { data: salesAfterPeriod } = await (supabase as any).from("invoices")
    .select("id")
    .eq("company_id", companyName)
    .eq("invoice_type", "sales")
    .gt("invoice_date", dateTo);

  const { data: saleReturnsAfterPeriod } = await (supabase as any).from("invoices")
    .select("id")
    .eq("company_id", companyName)
    .eq("invoice_type", "sale_return")
    .gt("invoice_date", dateTo);

  const { data: purchaseInvoicesAfterPeriod } = await (supabase as any).from("invoices")
    .select("id")
    .eq("company_id", companyName)
    .eq("invoice_type", "purchase")
    .gt("invoice_date", dateTo);

  const { data: purchaseReturnsAfterPeriod } = await (supabase as any).from("invoices")
    .select("id")
    .eq("company_id", companyName)
    .eq("invoice_type", "purchase_return")
    .gt("invoice_date", dateTo);

  // Fetch labour invoices (potential direct inventory expenses)
  const { data: labourInvoices } = await (supabase as any).from("invoices")
    .select("subtotal, tax_amount, total_amount, invoice_date, entity_type")
    .eq("company_id", companyName)
    .eq("entity_type", "labour")
    .gte("invoice_date", dateFrom)
    .lte("invoice_date", dateTo);

  // Fetch transport invoices (potential direct inventory expenses)
  const { data: transportInvoices } = await (supabase as any).from("invoices")
    .select("subtotal, tax_amount, total_amount, invoice_date, entity_type")
    .eq("company_id", companyName)
    .eq("entity_type", "transport")
    .gte("invoice_date", dateFrom)
    .lte("invoice_date", dateTo);

  // Helper to aggregate quantities per product
  const createQtyMap = (items: any[]) => {
    const map = new Map<string, number>();
    (items || []).forEach((item: any) => {
      const productId = String(item.product_id);
      const qty = Number(item.quantity) || 0;
      map.set(productId, (map.get(productId) || 0) + qty);
    });
    return map;
  };

  // Fetch invoice items for movements before and inside the period
  const idsOf = (rows: any[] | null | undefined) => (rows || []).map((r) => r.id);

  const loadItems = async (invoiceIds: string[]) => {
    if (!invoiceIds.length) return [];
    const { data } = await (supabase as any).from("invoice_items")
      .select("quantity, unit_price, product_id, invoice_id")
      .in("invoice_id", invoiceIds);
    return data || [];
  };

  const salesInvoiceItems = await loadItems(idsOf(allSalesInvoices));
  const purchaseInvoiceItems = await loadItems(idsOf(purchaseInvoices));
  const saleReturnItems = await loadItems(idsOf(saleReturns));
  const purchaseReturnItems = await loadItems(idsOf(purchaseReturns));

  const salesInvoiceItemsAfterPeriod = await loadItems(idsOf(salesAfterPeriod));
  const purchaseInvoiceItemsAfterPeriod = await loadItems(idsOf(purchaseInvoicesAfterPeriod));
  const saleReturnItemsAfterPeriod = await loadItems(idsOf(saleReturnsAfterPeriod));
  const purchaseReturnItemsAfterPeriod = await loadItems(idsOf(purchaseReturnsAfterPeriod));

  // Quantity movements AFTER the reporting period (to derive closing stock for this period)
  const salesAfterQtyMap = createQtyMap(salesInvoiceItemsAfterPeriod);
  const saleReturnsAfterQtyMap = createQtyMap(saleReturnItemsAfterPeriod);
  const purchaseAfterQtyMap = createQtyMap(purchaseInvoiceItemsAfterPeriod);
  const purchaseReturnsAfterQtyMap = createQtyMap(purchaseReturnItemsAfterPeriod);

  // Quantity movements inside the reporting period (to derive closing stock at period end)
  const salesPeriodQtyMap = createQtyMap(salesInvoiceItems);
  const saleReturnsPeriodQtyMap = createQtyMap(saleReturnItems);
  const purchasePeriodQtyMap = createQtyMap(purchaseInvoiceItems);
  const purchaseReturnsPeriodQtyMap = createQtyMap(purchaseReturnItems);

  const { data: userData } = await supabase.auth.getUser();

  // Fetch all products (including imported opening stock quantity used for first-period opening stock)
  const { data: products, error: productsError } = await (supabase as any).from("products")
    .select("id, current_stock, purchase_price, selling_price, gst_rate, opening_stock_qty, opening_stock_value")
    .eq("company_id", companyName);

  if (productsError) {
    logger.error("Error fetching products for opening/closing stock:", productsError);
  }

  let openingStockValue = 0;
  let closingStockValue = 0;

  (products || []).forEach((product: any) => {
    const productId = String(product.id);
    const currentStock = Number(product.current_stock) || 0;

    let costPerUnit = Number(product.purchase_price) || 0;
    if (!costPerUnit || Number.isNaN(costPerUnit)) {
      costPerUnit = 0;
    }

    const movementsInPeriod =
      (purchasePeriodQtyMap.get(productId) || 0) -
      (purchaseReturnsPeriodQtyMap.get(productId) || 0) -
      (salesPeriodQtyMap.get(productId) || 0) +
      (saleReturnsPeriodQtyMap.get(productId) || 0);

    const movementsAfter =
      (purchaseAfterQtyMap.get(productId) || 0) -
      (purchaseReturnsAfterQtyMap.get(productId) || 0) -
      (salesAfterQtyMap.get(productId) || 0) +
      (saleReturnsAfterQtyMap.get(productId) || 0);

    const closingQtyForPeriod = currentStock - movementsAfter;
    const openingQtyForPeriod = closingQtyForPeriod - movementsInPeriod;

    openingStockValue += Math.max(0, openingQtyForPeriod) * costPerUnit;
    closingStockValue += Math.max(0, closingQtyForPeriod) * costPerUnit;
  });

  const openingStockCost = openingStockValue;
  const closingStock = closingStockValue;

  const totalPurchaseInvoices =
    purchaseInvoices?.reduce((sum, inv) => sum + (inv.subtotal || 0), 0) || 0;
  const totalPurchases = totalPurchaseInvoices;
  const totalPurchaseReturns =
    purchaseReturns?.reduce((sum, inv) => sum + (inv.subtotal || 0), 0) || 0;
  const netPurchases = totalPurchases - totalPurchaseReturns;

  const totalSales =
    allSalesInvoices?.reduce((sum, inv) => sum + (inv.subtotal || 0), 0) || 0;
  const totalSaleReturns =
    saleReturns?.reduce((sum, inv) => sum + (inv.subtotal || 0), 0) || 0;
  const netSales = totalSales - totalSaleReturns;

  const labourDirectBase =
    (labourInvoices || []).reduce((sum, inv) => sum + (inv.subtotal || 0), 0) || 0;
  const transportDirectBase =
    (transportInvoices || []).reduce((sum, inv) => sum + (inv.subtotal || 0), 0) || 0;
  const directExpenses = labourDirectBase + transportDirectBase;

  let salesDiscounts = 0;
  // discount_amount column is removed from types, so it's 0 for now

  // Purchase discounts (indirect income)
  let purchaseDiscounts = 0;
  // discount_amount column is removed from types, so it's 0 for now

  const indirectExpenses = salesDiscounts;

  // Ledger-based indirect income/expenses
  const user = userData?.user;
  let indirectIncome = 0;
  let indirectExpensesFromLedgers = 0;

  if (user?.id) {
    const { data: companyLedgers, error: ledgersError } = await (supabase as any).from("ledgers")
      .select("id, ledger_type")
      .eq("company_id", companyName);

    if (ledgersError) {
      logger.error("Error fetching ledgers for company:", ledgersError);
    }

    const ledgerIds = (companyLedgers || []).map((l) => l.id);
    const ledgerTypeMap = new Map((companyLedgers || []).map((l) => [l.id, l.ledger_type]));

    if (ledgerIds.length > 0) {
      const { data: entriesData, error: entriesError } = await (supabase as any).from("ledger_entries")
        .select("debit_amount, credit_amount, ledger_id, entry_date")
        .in("ledger_id", ledgerIds)
        .eq("user_id", user.id)
        .gte("entry_date", dateFrom)
        .lte("entry_date", dateTo);

      if (entriesError) {
        logger.error("Error fetching ledger entries:", entriesError);
      }

      const ledgerEntries = (entriesData || []).map((entry: any) => ({
        ...entry,
        ledger_type: ledgerTypeMap.get(entry.ledger_id),
      }));

      indirectIncome = ledgerEntries.reduce((sum: number, entry: any) => {
        const ledgerType = entry.ledger_type?.toLowerCase();
        const credit = entry.credit_amount || 0;
        const debit = entry.debit_amount || 0;
        switch (ledgerType) {
          case "income":
            return sum + (credit - debit);
          case "cash":
          case "bank":
          case "receivables":
          case "payables":
            return sum + credit;
          default:
            return sum;
        }
      }, 0);

      indirectExpensesFromLedgers = ledgerEntries.reduce(
        (sum: number, entry: any) => {
          const ledgerType = entry.ledger_type?.toLowerCase();
          const credit = entry.credit_amount || 0;
          const debit = entry.debit_amount || 0;
          switch (ledgerType) {
            case "expense":
            case "expenses":
              return sum + (debit - credit);
            case "cash":
            case "bank":
            case "receivables":
            case "payables":
              return sum + debit;
            default:
              return sum;
          }
        },
        0
      );
    }
  }

  indirectIncome += purchaseDiscounts;
  const totalIndirectExpenses = indirectExpenses + indirectExpensesFromLedgers;

  const effectiveCOGS = openingStockCost + netPurchases + directExpenses - closingStock;
  const grossProfit = netSales - effectiveCOGS;
  const netProfit = grossProfit - totalIndirectExpenses + indirectIncome;

  const rows = [
    { subcategory: "Sales Account (All Sales Invoices)", amount: totalSales, category: "Revenue" },
    { subcategory: "Less: Sale Returns", amount: -totalSaleReturns, category: "Revenue" },
    { subcategory: "Net Sales", amount: netSales, category: "Revenue" },
    { subcategory: "Opening Stock", amount: openingStockCost, category: "Cost of Goods Sold" },
    { subcategory: "Purchase Account (Invoices)", amount: totalPurchaseInvoices, category: "Cost of Goods Sold" },
    { subcategory: "Purchase Orders (PO)", amount: totalPurchaseOrders, category: "Cost of Goods Sold" },
    { subcategory: "Less: Purchase Returns", amount: -totalPurchaseReturns, category: "Cost of Goods Sold" },
    { subcategory: "Net Purchases", amount: netPurchases, category: "Cost of Goods Sold" },
    { subcategory: "Direct Expenses - Labour (Base, excl. GST)", amount: labourDirectBase, category: "Cost of Goods Sold" },
    { subcategory: "Direct Expenses - Transport (Base, excl. GST)", amount: transportDirectBase, category: "Cost of Goods Sold" },
    { subcategory: "Total Direct Expenses (Base)", amount: directExpenses, category: "Cost of Goods Sold" },
    { subcategory: "Less: Closing Stock", amount: -closingStock, category: "Cost of Goods Sold" },
    { subcategory: "Cost of Goods Sold", amount: effectiveCOGS, category: "Cost of Goods Sold" },
    { subcategory: "", amount: grossProfit, category: "Gross Profit" },
    { subcategory: "Sales Discounts", amount: salesDiscounts, category: "Indirect Expenses" },
    { subcategory: "Indirect Expenses (Ledger)", amount: indirectExpensesFromLedgers, category: "Indirect Expenses" },
    { subcategory: "Total Indirect Expenses", amount: totalIndirectExpenses, category: "Indirect Expenses" },
    { subcategory: "Purchase Discounts", amount: purchaseDiscounts, category: "Indirect Income" },
    { subcategory: "Indirect Income (Ledger)", amount: indirectIncome - purchaseDiscounts, category: "Indirect Income" },
    { subcategory: "Net Profit", amount: netProfit, category: "Net Profit" },
  ];

  const summary = {
    totalSales: netSales,
    totalPurchases: netPurchases,
    grossProfit,
    netProfit,
    saleReturns: totalSaleReturns,
    purchaseReturns: totalPurchaseReturns,
    openingStock: openingStockCost,
    closingStock,
    cogs: effectiveCOGS,
    directExpenses,
    indirectExpenses: totalIndirectExpenses,
    indirectIncome,
    salesDiscounts,
  };

  return { rows, summary };
}

