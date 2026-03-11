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
    .select("id, name, hsn_code, gst_rate, purchase_price, opening_stock_qty, opening_stock_value")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (productsError) {
    logger.error("Inventory as-of: failed to load products:", productsError);
    throw productsError;
  }

  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices")
    .select("id, invoice_type")
    .eq("company_id", companyId)
    .in("invoice_type", ["sales", "purchase", "sale_return", "purchase_return"])
    .lte("invoice_date", asOfDate);

  if (invoicesError) {
    logger.error("Inventory as-of: failed to load invoices:", invoicesError);
    throw invoicesError;
  }

  const invoiceIds = (invoices || []).map((i: any) => i.id);
  const invoiceTypeById = new Map<string, string>(
    (invoices || []).map((i: any) => [String(i.id), String(i.invoice_type)])
  );

  let items: any[] = [];
  if (invoiceIds.length > 0) {
    const { data: itemsData, error: itemsError } = await supabase
      .from("invoice_items")
      .select("invoice_id, product_id, quantity")
      .in("invoice_id", invoiceIds);

    if (itemsError) {
      logger.error("Inventory as-of: failed to load invoice items:", itemsError);
      throw itemsError;
    }
    items = itemsData || [];
  }

  const movementQty = new Map<string, number>();
  for (const item of items) {
    const productId = item.product_id ? String(item.product_id) : null;
    if (!productId) continue;

    const qty = Number(item.quantity) || 0;
    const invoiceType = invoiceTypeById.get(String(item.invoice_id)) || "";

    // Purchases increase qty; sales decrease qty; returns reverse that
    let signedQty = 0;
    if (invoiceType === "purchase") signedQty = qty;
    else if (invoiceType === "purchase_return") signedQty = -qty;
    else if (invoiceType === "sales") signedQty = -qty;
    else if (invoiceType === "sale_return") signedQty = qty;

    if (signedQty !== 0) {
      movementQty.set(productId, (movementQty.get(productId) || 0) + signedQty);
    }
  }

  return (products || []).map((p: any) => {
    const importedOpeningQty = Number(p.opening_stock_qty) || 0;
    const openingValue = Number(p.opening_stock_value) || 0;
    const purchasePrice = Number(p.purchase_price) || 0;

    let unitCost = purchasePrice;
    if ((!unitCost || Number.isNaN(unitCost)) && importedOpeningQty > 0 && openingValue > 0) {
      unitCost = openingValue / importedOpeningQty;
    }
    if (!unitCost || Number.isNaN(unitCost)) unitCost = 0;

    const qtyAsOf = importedOpeningQty + (movementQty.get(String(p.id)) || 0);
    const stockValue = qtyAsOf * unitCost;

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

