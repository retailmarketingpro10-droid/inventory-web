import { supabase } from '@/integrations/supabase/client';
import { calculateGSTBreakdown, GSTConfig } from '@/utils/gstBreakdown';
import { logger } from '@/lib/logger';

export interface InvoiceGSTData {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  transaction_type: 'sale' | 'purchase' | 'sale_return' | 'purchase_return';
  entity_name: string;
  entity_id: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  from_state: string;
  to_state: string;
  forceIGST?: boolean;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    gst_rate: number;
    line_total: number;
  }>;
}

export interface GSTSyncResult {
  success: boolean;
  gst_entry_id?: string;
  error?: string;
}

export class GSTSyncService {
  /**
   * Create GST entry automatically when invoice is created
   */
  static async createGSTEntryFromInvoice(invoiceData: InvoiceGSTData): Promise<GSTSyncResult> {
    try {
      // Get user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      // Calculate GST breakdown for the entire invoice
      // Use forceIGST flag if provided, otherwise check state difference
      const isInterState = invoiceData.forceIGST || (invoiceData.from_state !== invoiceData.to_state && invoiceData.from_state && invoiceData.to_state);
      
      const gstConfig: GSTConfig = {
        fromState: invoiceData.from_state,
        toState: invoiceData.to_state,
        isInterState: isInterState
      };

      const breakdown = calculateGSTBreakdown(
        invoiceData.subtotal,
        this.calculateAverageGSTRate(invoiceData.line_items),
        gstConfig
      );

      // For return transactions, make amounts negative to deduct from totals
      const isReturn = invoiceData.transaction_type === 'sale_return' || invoiceData.transaction_type === 'purchase_return';
      const multiplier = isReturn ? -1 : 1;

      // Create GST entry
      const { data: gstEntry, error } = await supabase
        .from('gst_entries')
        .insert([{
          transaction_type: invoiceData.transaction_type,
          entity_name: invoiceData.entity_name,
          invoice_number: invoiceData.invoice_number,
          invoice_date: invoiceData.invoice_date,
          taxable_amount: breakdown.taxableAmount * multiplier,
          gst_rate: this.calculateAverageGSTRate(invoiceData.line_items),
          cgst: breakdown.cgst * multiplier,
          sgst: breakdown.sgst * multiplier,
          igst: breakdown.igst * multiplier,
          total_gst: breakdown.totalGST * multiplier,
          total_amount: breakdown.totalAmount * multiplier,
          from_state: invoiceData.from_state,
          to_state: invoiceData.to_state,
          is_interstate: gstConfig.isInterState,
          user_id: user.id,
          // Add invoice reference
          invoice_id: invoiceData.invoice_id
        }])
        .select()
        .single();

      if (error) throw error;

      return { 
        success: true, 
        gst_entry_id: gstEntry.id 
      };
    } catch (error) {
      logger.error('Error creating GST entry from invoice:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Update GST entry when invoice status changes
   */
  static async updateGSTEntryFromInvoice(
    invoiceId: string, 
    status: string, 
    paymentDate?: string
  ): Promise<GSTSyncResult> {
    try {
      // Find the GST entry for this invoice
      const { data: gstEntry, error: findError } = await supabase
        .from('gst_entries')
        .select('id')
        .eq('invoice_id', invoiceId)
        .single();

      if (findError) {
        return { success: false, error: 'GST entry not found for this invoice' };
      }

      // Update GST entry status based on invoice status
      let gstStatus = 'due';
      if (status === 'paid') {
        gstStatus = 'paid';
      } else if (status === 'cancelled') {
        gstStatus = 'cancelled';
      } else if (status === 'overdue') {
        gstStatus = 'overdue';
      }

      const updateData: any = { status: gstStatus };
      if (paymentDate) {
        updateData.payment_date = paymentDate;
      }

      const { error: updateError } = await supabase
        .from('gst_entries')
        .update(updateData)
        .eq('id', gstEntry.id);

      if (updateError) throw updateError;

      return { success: true };
    } catch (error) {
      logger.error('Error updating GST entry from invoice:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Update GST entry amounts when invoice is edited/modified
   */
  static async updateGSTEntryAmounts(
    invoiceId: string,
    invoiceData: InvoiceGSTData
  ): Promise<GSTSyncResult> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      // Find existing GST entry
      const { data: existingGST, error: findError } = await supabase
        .from('gst_entries')
        .select('id')
        .eq('invoice_id', invoiceId)
        .single();

      if (findError || !existingGST) {
        // If no entry exists, create one
        return await this.createGSTEntryFromInvoice(invoiceData);
      }

      // Recalculate GST breakdown
      const isInterState = invoiceData.forceIGST || 
        (invoiceData.from_state !== invoiceData.to_state && 
         invoiceData.from_state && invoiceData.to_state);
      
      const gstConfig: GSTConfig = {
        fromState: invoiceData.from_state,
        toState: invoiceData.to_state,
        isInterState: isInterState
      };

      const breakdown = calculateGSTBreakdown(
        invoiceData.subtotal,
        this.calculateAverageGSTRate(invoiceData.line_items),
        gstConfig
      );

      const isReturn = invoiceData.transaction_type === 'sale_return' || 
                       invoiceData.transaction_type === 'purchase_return';
      const multiplier = isReturn ? -1 : 1;

      // Update GST entry
      const { error: updateError } = await supabase
        .from('gst_entries')
        .update({
          transaction_type: invoiceData.transaction_type,
          entity_name: invoiceData.entity_name,
          invoice_number: invoiceData.invoice_number,
          invoice_date: invoiceData.invoice_date,
          taxable_amount: breakdown.taxableAmount * multiplier,
          gst_rate: this.calculateAverageGSTRate(invoiceData.line_items),
          cgst: breakdown.cgst * multiplier,
          sgst: breakdown.sgst * multiplier,
          igst: breakdown.igst * multiplier,
          total_gst: breakdown.totalGST * multiplier,
          total_amount: breakdown.totalAmount * multiplier,
          from_state: invoiceData.from_state,
          to_state: invoiceData.to_state,
          is_interstate: gstConfig.isInterState
        })
        .eq('id', existingGST.id);

      if (updateError) throw updateError;

      return { success: true };
    } catch (error) {
      logger.error('Error updating GST entry amounts:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Delete GST entry when invoice is deleted
   */
  static async deleteGSTEntryFromInvoice(invoiceId: string): Promise<GSTSyncResult> {
    try {
      const { error } = await supabase
        .from('gst_entries')
        .delete()
        .eq('invoice_id', invoiceId);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      logger.error('Error deleting GST entry from invoice:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get GST entries linked to an invoice
   */
  static async getGSTEntriesForInvoice(invoiceId: string) {
    try {
      const { data, error } = await supabase
        .from('gst_entries')
        .select('*')
        .eq('invoice_id', invoiceId);

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error fetching GST entries for invoice:', error);
      return [];
    }
  }

  /**
   * Calculate average GST rate from line items
   */
  private static calculateAverageGSTRate(lineItems: Array<{ gst_rate: number; line_total: number }>): number {
    if (lineItems.length === 0) return 18; // Default rate

    let totalTaxableAmount = 0;
    let weightedGSTRate = 0;

    lineItems.forEach(item => {
      totalTaxableAmount += item.line_total;
      weightedGSTRate += item.line_total * item.gst_rate;
    });

    return totalTaxableAmount > 0 ? weightedGSTRate / totalTaxableAmount : 18;
  }

  /**
   * Get entity details for GST calculation
   */
  static async getEntityDetails(entityId: string, entityType: 'supplier' | 'customer' | 'wholesaler' | 'transport' | 'labour' | 'other') {
    try {
      // For 'other' type, return default values if no entity_id
      if (entityType === 'other' && !entityId) {
        return {
          company_name: 'Miscellaneous',
          name: 'Miscellaneous',
          state: '27' // Default state
        };
      }
      
      // Check if it's a business entity type
      const isBusinessEntity = ['wholesaler', 'transport', 'labour', 'other'].includes(entityType);
      
      if (isBusinessEntity) {
        // For 'other' type with entity_id, try to find in business_entities
        if (entityId) {
          const { data, error } = await supabase
            .from('business_entities')
            .select('name, entity_type, state')
            .eq('id', entityId)
            .single();

          if (!error && data) {
            return {
              company_name: data.name,
              name: data.name,
              state: data.state || '27'
            };
          }
        }
        // Fallback for 'other' type without entity_id or not found
        return {
          company_name: 'Miscellaneous',
          name: 'Miscellaneous',
          state: '27'
        };
      } else {
        // For suppliers or customers
        const tableName = entityType === 'supplier' ? 'suppliers' : 'customers';
        const { data, error } = await supabase
          .from(tableName)
          .select('company_name, state')
          .eq('id', entityId)
          .single();

        if (error) throw error;
        return data;
      }
    } catch (error) {
      logger.error('Error fetching entity details:', error);
      return null;
    }
  }

  /**
   * Sync all existing invoices with GST entries (for migration)
   */
  static async syncAllInvoicesWithGST() {
    try {
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select(`
          *,
          invoice_items(*),
          suppliers(company_name, state),
          customers(company_name, state)
        `);

      if (error) throw error;

      const results = [];
      for (const invoice of invoices || []) {
        // Check if GST entry already exists
        const existingGST = await this.getGSTEntriesForInvoice(invoice.id);
        if (existingGST.length > 0) continue;

        // Determine entity details
        const entity = invoice.suppliers || invoice.customers;
        const entityName = entity?.company_name || 'Unknown';
        const entityState = entity?.state || '27'; // Default to Maharashtra

        const invoiceGSTData: InvoiceGSTData = {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          transaction_type: invoice.invoice_type === 'sales' ? 'sale' : 
                           invoice.invoice_type === 'sale_return' ? 'sale_return' :
                           invoice.invoice_type === 'purchase_return' ? 'purchase_return' : 'purchase',
          entity_name: entityName,
          entity_id: invoice.supplier_id || invoice.customer_id || '',
          subtotal: invoice.subtotal,
          tax_amount: invoice.tax_amount,
          total_amount: invoice.total_amount,
          from_state: entityState,
          to_state: '27', // Company state (should be configurable)
          line_items: invoice.invoice_items?.map((item: any) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            gst_rate: item.gst_rate,
            line_total: item.line_total
          })) || []
        };

        const result = await this.createGSTEntryFromInvoice(invoiceGSTData);
        results.push({ invoice_id: invoice.id, result });
      }

      return results;
    } catch (error) {
      logger.error('Error syncing all invoices with GST:', error);
      return [];
    }
  }
}

