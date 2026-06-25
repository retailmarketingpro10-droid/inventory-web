import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export interface InventoryAsOfRow {
  product_id: string;
  product_name: string;
  hsn_code?: string | null;
  gst_rate?: number | null;
  unit_cost: number;
  quantity_as_of: number;
  stock_value: number;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function getInventoryAsOf(params: {
  companyId: string;
  asOfDate: string; // YYYY-MM-DD
}): Promise<InventoryAsOfRow[]> {
  const { companyId, asOfDate } = params;

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name, hsn_code, gst_rate, purchase_price, current_stock, opening_stock_qty, opening_stock_value")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (productsError) {
    logger.error("Inventory as-of: failed to load products:", productsError);
    throw productsError;
  }

  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices")
    .select("id, invoice_type, invoice_date")
    .eq("company_id", companyId)
    .in("invoice_type", ["sales", "purchase", "sale_return", "purchase_return"]);

  if (invoicesError) {
    logger.error("Inventory as-of: failed to load invoices:", invoicesError);
    throw invoicesError;
  }

  const invoiceIdsUpTo = (invoices || [])
    .filter((i: any) => String(i.invoice_date) <= asOfDate)
    .map((i: any) => i.id);
  const invoiceTypeById = new Map<string, string>(
    (invoices || []).map((i: any) => [String(i.id), String(i.invoice_type)])
  );
  const invoiceDateById = new Map<string, string>(
    (invoices || []).map((i: any) => [String(i.id), String(i.invoice_date)])
  );

  let items: any[] = [];
  if (invoiceIdsUpTo.length > 0) {
    const { data: itemsData, error: itemsError } = await supabase
      .from("invoice_items")
      .select("invoice_id, product_id, quantity")
      .in("invoice_id", invoiceIdsUpTo);

    if (itemsError) {
      logger.error("Inventory as-of: failed to load invoice items:", itemsError);
      throw itemsError;
    }
    items = itemsData || [];
  }

  const movementQty = new Map<string, number>();
  const movementAfterQty = new Map<string, number>();

  for (const item of items) {
    const productId = item.product_id ? String(item.product_id) : null;
    if (!productId) continue;

    const qty = Number(item.quantity) || 0;
    const invoiceId = String(item.invoice_id);
    const invoiceType = invoiceTypeById.get(invoiceId) || "";
    const invoiceDate = invoiceDateById.get(invoiceId) || "";

    let signedQty = 0;
    if (invoiceType === "purchase") signedQty = qty;
    else if (invoiceType === "purchase_return") signedQty = -qty;
    else if (invoiceType === "sales") signedQty = -qty;
    else if (invoiceType === "sale_return") signedQty = qty;

    if (signedQty === 0) continue;

    if (invoiceDate <= asOfDate) {
      movementQty.set(productId, (movementQty.get(productId) || 0) + signedQty);
    }
    if (invoiceDate > asOfDate) {
      movementAfterQty.set(productId, (movementAfterQty.get(productId) || 0) + signedQty);
    }
  }

  return (products || []).map((p: any) => {
    const importedOpeningQty = Number(p.opening_stock_qty) || 0;
    const openingValue = Number(p.opening_stock_value) || 0;
    const currentStock = Number(p.current_stock) || 0;
    const purchasePrice = Number(p.purchase_price) || 0;

    let unitCost = purchasePrice;
    if ((!unitCost || Number.isNaN(unitCost)) && importedOpeningQty > 0 && openingValue > 0) {
      unitCost = openingValue / importedOpeningQty;
    }
    if (!unitCost || Number.isNaN(unitCost)) unitCost = 0;

    const movedQty = movementQty.get(String(p.id)) || 0;
    const movedAfter = movementAfterQty.get(String(p.id)) || 0;

    // Prefer current_stock minus future movements (handles products without opening_stock_qty)
    let qtyAsOf = importedOpeningQty + movedQty;
    if (importedOpeningQty === 0 && openingValue === 0 && currentStock > 0) {
      qtyAsOf = currentStock - movedAfter;
    }
    qtyAsOf = Math.max(0, qtyAsOf);

    let stockValue = qtyAsOf * unitCost;
    if (movedQty === 0 && openingValue > 0) {
      stockValue = openingValue;
    }

    return {
      product_id: String(p.id),
      product_name: String(p.name || ""),
      hsn_code: p.hsn_code ?? null,
      gst_rate: p.gst_rate ?? null,
      unit_cost: round2(unitCost),
      quantity_as_of: round2(qtyAsOf),
      stock_value: round2(stockValue),
    };
  });
}

/** Opening/closing stock for P&L — from product inventory, not ledger (stock is not auto-posted). */
export async function getStockValuationForPeriod(params: {
  companyId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<{ openingStock: number; closingStock: number }> {
  const dayBefore = new Date(params.dateFrom);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const openingAsOf = dayBefore.toISOString().split("T")[0];

  const [openingRows, closingRows] = await Promise.all([
    getInventoryAsOf({ companyId: params.companyId, asOfDate: openingAsOf }),
    getInventoryAsOf({ companyId: params.companyId, asOfDate: params.dateTo }),
  ]);

  const openingStock = round2(
    openingRows.reduce((sum, row) => sum + Math.max(0, row.stock_value), 0)
  );
  const closingStock = round2(
    closingRows.reduce((sum, row) => sum + Math.max(0, row.stock_value), 0)
  );

  return { openingStock, closingStock };
}

export async function getTotalStockValue(
  companyId: string,
  asOfDate?: string
): Promise<number> {
  const date = asOfDate || new Date().toISOString().split('T')[0];

  const { data: products, error } = await supabase
    .from('products')
    .select('current_stock, purchase_price, opening_stock_qty, opening_stock_value')
    .eq('company_id', companyId);

  if (error) {
    logger.error('getTotalStockValue: products', error);
    throw error;
  }

  const today = new Date().toISOString().split('T')[0];
  let fromCurrentStock = 0;
  for (const p of products || []) {
    const qty = Math.max(0, Number(p.current_stock) || 0);
    const price = Number(p.purchase_price) || 0;
    const openingQty = Number(p.opening_stock_qty) || 0;
    const openingValue = Number(p.opening_stock_value) || 0;
    let unitCost = price;
    if (!unitCost && openingQty > 0 && openingValue > 0) {
      unitCost = openingValue / openingQty;
    }
    fromCurrentStock += qty * unitCost;
  }

  if (date >= today && fromCurrentStock > 0) {
    return round2(fromCurrentStock);
  }

  const rows = await getInventoryAsOf({ companyId, asOfDate: date });
  return round2(rows.reduce((sum, row) => sum + Math.max(0, row.stock_value), 0));
}

