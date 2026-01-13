import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Plus, FileText, Download, Edit, Trash2, Eye, Receipt } from "lucide-react";
import { formatIndianCurrency, calculateGST } from "@/utils/indianBusiness";
import { downloadInvoiceAsCSV } from "@/utils/pdfGenerator";
import { InvoicePDF } from "@/components/pdf/InvoicePDF";
import { pdf } from "@react-pdf/renderer";
import { GSTSyncService } from "@/services/gstSyncService";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Invoice {
  id: string;
  invoice_number: string;
  custom_invoice_number: string | null;
  supplier_id: string | null;
  entity_id: string | null;
  entity_type: string | null;
  invoice_type: string;
  payment_status: string;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  discount_amount?: number;
  discount_percentage?: number;
  status: string;
  notes: string | null;
  total_paid?: number;
  amount_due?: number;
  suppliers?: {
    company_name: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
  };
  business_entities?: {
    name: string;
    entity_type: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
  };
}

interface InvoiceItem {
  id: string;
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  gst_rate: number;
  line_total: number;
}

interface BusinessEntity {
  id: string;
  name: string;
  entity_type: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  state?: string;
  created_at?: string;
}

interface Product {
  id: string;
  name: string;
  description?: string | null;
  hsn_code?: string | null;
  selling_price: number | null;
  gst_rate: number;
  current_stock?: number;
  min_stock_level?: number | null;
  sku?: string | null;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string | null;
  order_date: string;
  expected_delivery_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  created_at?: string;
  suppliers?: {
    company_name: string;
  };
}

interface PurchaseOrderItem {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  gst_rate: number;
  line_total: number;
  received_quantity: number;
}

interface InvoicePayment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method?: string;
  notes?: string;
  created_at: string;
}

export const InvoiceManager = () => {
  const { selectedCompany } = useCompany();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [hidePaidInvoices, setHidePaidInvoices] = useState(true);
  const [businessEntities, setBusinessEntities] = useState<BusinessEntity[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPO, setSelectedPO] = useState<string>("");
  const [poItems, setPOItems] = useState<PurchaseOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [showNewEntityForm, setShowNewEntityForm] = useState(false);
  const [formData, setFormData] = useState({
    entity_id: "",
    entity_type: "customer" as string,
    invoice_type: "sales" as string,
    custom_invoice_number: "",
    payment_status: "due" as string,
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: "",
    notes: "",
    discount_amount: 0,
    discount_percentage: 0
  });
  const [newEntityData, setNewEntityData] = useState({
    name: "",
    entity_type: "customer" as string,
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    gstin: ""
  });
  const [lineItems, setLineItems] = useState<Array<{
    product_id?: string;
    description: string;
    quantity: number;
    unit_price: number;
    gst_rate: number;
    max_quantity?: number; // For return invoices, store original quantity
  }>>([{
    product_id: undefined,
    description: "",
    quantity: 1,
    unit_price: 0,
    gst_rate: 18,
    max_quantity: undefined
  }]);
  const [companyState, setCompanyState] = useState('27'); // Default to Maharashtra
  const [forceIGST, setForceIGST] = useState(false); // Manual IGST selection override
  const [applyTaxOnSubtotal, setApplyTaxOnSubtotal] = useState(false); // Apply tax on subtotal instead of line items
  const [subtotalTaxRate, setSubtotalTaxRate] = useState(18); // Tax rate for subtotal
  const [productSearch, setProductSearch] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [pendingProductItem, setPendingProductItem] = useState<{
    index: number;
    description: string;
    unit_price: number;
    gst_rate: number;
  } | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [invoicePayments, setInvoicePayments] = useState<InvoicePayment[]>([]);
  const [paymentData, setPaymentData] = useState({
    amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    notes: ''
  });
  const { toast } = useToast();

  // Define fetchInvoicePayments early so it can be used in useEffect
  const fetchInvoicePayments = useCallback(async (invoiceId: string) => {
    try {
      const { data, error } = await supabase
        .from('invoice_payments' as any)
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      setInvoicePayments((data || []) as unknown as InvoicePayment[]);
    } catch (error) {
      console.error('Failed to load payments:', error);
      setInvoicePayments([]);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    fetchBusinessEntities();
    fetchProducts();
    if (formData.invoice_type === 'purchase' || formData.invoice_type === 'purchase_return') {
      fetchPurchaseOrders(formData.invoice_type);
    }
  }, [selectedCompany, formData.invoice_type]);

  // Fetch invoice payments when view dialog opens
  useEffect(() => {
    if (viewOpen && selectedInvoice) {
      fetchInvoicePayments(selectedInvoice.id);
    } else {
      // Clear payments when dialog closes
      setInvoicePayments([]);
    }
  }, [viewOpen, selectedInvoice?.id, fetchInvoicePayments]);

  const fetchInvoices = async () => {
    try {
      let query: any = supabase
        .from('invoices')
        .select(`
          *,
          suppliers (
            company_name,
            address,
            phone,
            email,
            gstin
          ),
          business_entities (
            name,
            entity_type,
            address,
            phone,
            email,
            gstin
          ),
          invoice_payments (
            amount
          )
        `);

      // Filter by company if a company is selected
      if (selectedCompany?.company_name) {
        query = query.eq('company_id', selectedCompany.company_name);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      
      // Calculate amount due for each invoice
      const invoicesWithBalance = (data || []).map((invoice: any) => {
        const totalPaid = (invoice.invoice_payments || []).reduce((sum: number, p: InvoicePayment) => sum + p.amount, 0);
        const amountDue = invoice.total_amount - totalPaid;
        return {
          ...invoice,
          total_paid: totalPaid,
          amount_due: amountDue
        };
      });
      
      setInvoices(invoicesWithBalance);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load invoices",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBusinessEntities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Filter by user_id since business_entities table doesn't have company_id
      // All entities belong to the user, and company filtering is handled at application level if needed
      const { data, error } = await supabase
        .from('business_entities')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Deduplicate business entities by name (case-insensitive) and entity_type
      // Keep the most recently created one if duplicates exist
      const seen = new Map<string, BusinessEntity>();
      const entities = (data || []) as BusinessEntity[];
      
      for (const entity of entities) {
        // Create a unique key from name (lowercase, trimmed) and entity_type
        const key = `${entity.name.toLowerCase().trim()}_${entity.entity_type}`;
        
        // If we haven't seen this combination, or if this one is newer, keep it
        if (!seen.has(key)) {
          seen.set(key, entity);
        } else {
          // Compare creation dates if available
          const existing = seen.get(key)!;
          const existingDate = existing.created_at ? new Date(existing.created_at).getTime() : 0;
          const currentDate = entity.created_at ? new Date(entity.created_at).getTime() : 0;
          
          // Keep the newer one
          if (currentDate > existingDate) {
            seen.set(key, entity);
          }
        }
      }
      
      // Convert map values back to array and sort by name
      const uniqueEntities = Array.from(seen.values()).sort((a, b) => 
        a.name.localeCompare(b.name)
      );
      
      setBusinessEntities(uniqueEntities);
    } catch (error) {
      console.error('Failed to load business entities:', error);
      toast({
        title: "Error",
        description: "Failed to load business entities",
        variant: "destructive"
      });
    }
  };

  const fetchProducts = async () => {
    try {
      let query: any = supabase
        .from('products')
        .select('id, name, description, selling_price, gst_rate, current_stock, min_stock_level, hsn_code');

      // Filter by company if a company is selected
      if (selectedCompany?.company_name) {
        query = query.eq('company_id', selectedCompany.company_name);
      }

      const { data, error } = await query.order('name');

      if (error) {
        console.error('Failed to load products:', error);
        toast({
          title: "Error",
          description: "Failed to load products. Please try again.",
          variant: "destructive"
        });
        setProducts([]);
        return;
      }
      setProducts(data || []);
    } catch (error) {
      console.error('Failed to load products:', error);
      toast({
        title: "Error",
        description: "Failed to load products. Please try again.",
        variant: "destructive"
      });
      setProducts([]);
    }
  };

  const fetchPurchaseOrders = async (invoiceType?: string) => {
    try {
      let query: any = supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers (
            company_name
          )
        `);

      // Filter by company if a company is selected
      if (selectedCompany?.company_name) {
        query = query.eq('company_id', selectedCompany.company_name);
      }

      // For purchase return, show all POs. For purchase invoice, show received/partial/draft/sent POs
      // Include draft and sent so newly created POs are visible
      const type = invoiceType || formData.invoice_type;
      if (type === 'purchase') {
        query = query.in('status', ['received', 'partial', 'draft', 'sent']);
      }
      // For purchase return, show all POs (no filter)

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setPurchaseOrders(data || []);
    } catch (error) {
      console.error('Failed to load purchase orders:', error);
      toast({
        title: "Error",
        description: "Failed to load purchase orders",
        variant: "destructive"
      });
    }
  };

  const loadPOItems = async (poId: string) => {
    try {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('purchase_order_id', poId);

      if (error) throw error;
      setPOItems(data || []);

      // Populate line items from PO
      // For return invoices, start with quantity 0 so user can specify return quantity
      // For purchase invoices, use full quantity
      if (data && data.length > 0) {
        const items = data.map(item => ({
          product_id: item.product_id || undefined,
          description: item.description,
          quantity: (formData.invoice_type === 'sale_return' || formData.invoice_type === 'purchase_return') ? 0 : item.quantity,
          unit_price: item.unit_price,
          gst_rate: item.gst_rate,
          max_quantity: (formData.invoice_type === 'sale_return' || formData.invoice_type === 'purchase_return') ? item.quantity : undefined
        }));
        setLineItems(items);
        
        // Show message for return invoices
        if (formData.invoice_type === 'sale_return' || formData.invoice_type === 'purchase_return') {
          toast({
            title: "Return Invoice",
            description: "Items loaded. Please specify the return quantity for each item (0 to skip, max = original quantity).",
          });
        }
      }
    } catch (error) {
      console.error('Failed to load PO items:', error);
      toast({
        title: "Error",
        description: "Failed to load purchase order items",
        variant: "destructive"
      });
    }
  };

  const generateInvoiceNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const timestamp = now.getTime().toString().slice(-6);
    return `INV-${year}${month}-${timestamp}`;
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    // Calculate subtotal from line items
    lineItems.forEach(item => {
      const lineTotal = item.quantity * item.unit_price;
      subtotal += lineTotal;
    });

    // Apply discount - allow both flat rate and percentage to work together
    let discountAmount = 0;
    // First apply flat discount amount
    if (formData.discount_amount > 0) {
      discountAmount = formData.discount_amount;
    }
    // Then apply percentage discount on the remaining amount after flat discount
    if (formData.discount_percentage > 0) {
      const remainingAfterFlat = subtotal - discountAmount;
      const percentageDiscount = (remainingAfterFlat * formData.discount_percentage) / 100;
      discountAmount += percentageDiscount;
    }
    
    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

    // Calculate tax based on whether tax is applied on subtotal or individual items
    if (applyTaxOnSubtotal) {
      // Apply tax on subtotal after discount
      const entityState = formData.entity_id ? 
        (businessEntities.find(e => e.id === formData.entity_id)?.state || '27') : '27';
      const isInterState = forceIGST || (entityState !== companyState && entityState && companyState);
      
      taxAmount = (subtotalAfterDiscount * subtotalTaxRate) / 100;
      
      if (isInterState) {
        // Inter-state: full tax is IGST
        igst = taxAmount;
      } else {
        // Intra-state: split between CGST and SGST
        cgst = taxAmount / 2;
        sgst = taxAmount / 2;
      }
    } else {
      // Apply tax on individual line items
      // IMPORTANT: Apply discount proportionally to each line item BEFORE calculating tax
      lineItems.forEach(item => {
        const lineTotal = item.quantity * item.unit_price;
        
        // Calculate proportional discount for this line item
        // Distribute discount based on each item's contribution to subtotal
        let itemDiscount = 0;
        if (subtotal > 0 && discountAmount > 0) {
          const itemProportion = lineTotal / subtotal;
          itemDiscount = discountAmount * itemProportion;
        }
        
        // Apply discount to line item total
        const lineTotalAfterDiscount = Math.max(0, lineTotal - itemDiscount);
        
        // Calculate GST based on forceIGST flag or state difference
        const entityState = formData.entity_id ? 
          (businessEntities.find(e => e.id === formData.entity_id)?.state || '27') : '27';
        const isInterState = forceIGST || (entityState !== companyState && entityState && companyState);
        
        // Calculate tax on discounted amount (not original amount)
        const gstAmount = (lineTotalAfterDiscount * item.gst_rate) / 100;
        taxAmount += gstAmount;
        
        if (isInterState) {
          // Inter-state: full tax is IGST
          igst += gstAmount;
        } else {
          // Intra-state: split between CGST and SGST
          cgst += gstAmount / 2;
          sgst += gstAmount / 2;
        }
      });
    }

    return {
      subtotal,
      discountAmount,
      subtotalAfterDiscount,
      taxAmount,
      total: subtotalAfterDiscount + taxAmount,
      cgst,
      sgst,
      igst
    };
  };

  const createNewEntity = async () => {
    try {
      // Get current user for RLS compliance
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const entityData = {
        ...newEntityData,
        entity_type: formData.entity_type, // Use the current entity type from form
        user_id: user.id
        // Note: business_entities table doesn't have company_id column
        // Entities are filtered by user_id instead
      };

      const { data, error } = await supabase
        .from('business_entities')
        .insert([entityData])
        .select()
        .single();

      if (error) throw error;
      
      // Add the new entity to the list immediately to avoid waiting for refetch
      setBusinessEntities(prev => [...prev, data]);
      
      setFormData(prev => ({ 
        ...prev, 
        entity_id: data.id,
        entity_type: data.entity_type 
      }));
      setShowNewEntityForm(false);
      setNewEntityData({
        name: "",
        entity_type: formData.entity_type, // Preserve the current entity type
        contact_person: "",
        phone: "",
        email: "",
        address: "",
        gstin: ""
      });
      
      // Also refetch to ensure consistency
      await fetchBusinessEntities();
      
      toast({ title: "Success", description: "New entity created successfully" });
    } catch (error) {
      console.error('Failed to create entity:', error);
      toast({
        title: "Error",
        description: "Failed to create entity",
        variant: "destructive"
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Get current user for RLS compliance
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Validate: Customer invoices require an entity, other types can use "Billing Name" (no entity)
      if (formData.entity_type === 'customer' && !formData.entity_id) {
        toast({
          title: "Validation Error",
          description: "Please select a customer for this invoice",
          variant: "destructive"
        });
        return;
      }

      // Filter valid line items (must have description and quantity > 0)
      const validLineItems = lineItems.filter(item => 
        item.description && item.description.trim() !== '' && item.quantity > 0
      );

      // Validate that we have at least one valid line item
      if (validLineItems.length === 0) {
        toast({
          title: "Validation Error",
          description: "Please add at least one item with description and quantity greater than 0",
          variant: "destructive"
        });
        return;
      }

      // Calculate totals using valid line items only
      const totals = calculateTotals();
      
      // Validate totals are valid
      if (isNaN(totals.subtotal) || isNaN(totals.taxAmount) || isNaN(totals.total)) {
        toast({
          title: "Validation Error",
          description: "Invalid totals calculated. Please check your line items.",
          variant: "destructive"
        });
        return;
      }

      let invoiceNumber = formData.custom_invoice_number || generateInvoiceNumber();

      // If user provided a custom invoice number, validate it isn't already used for this user
      if (formData.custom_invoice_number) {
        const { data: existing, error: existingError } = await supabase
          .from('invoices')
          .select('id')
          .eq('user_id', user.id)
          .eq('invoice_number', invoiceNumber)
          .maybeSingle();

        if (existingError) throw existingError;
        if (existing) {
          toast({
            title: "Duplicate Invoice Number",
            description: "This invoice number already exists. Please choose a different one.",
            variant: "destructive"
          });
          return;
        }
      }

      // Validate company is selected
      if (!selectedCompany?.company_name) {
        toast({
          title: "Validation Error",
          description: "Please select a company before creating an invoice",
          variant: "destructive"
        });
        return;
      }

      // Create invoice
      let invoice: any;
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .insert([{
          invoice_number: invoiceNumber,
          custom_invoice_number: formData.custom_invoice_number || null,
          entity_id: formData.entity_id || null,
          entity_type: formData.entity_type,
          invoice_type: formData.invoice_type,
          payment_status: formData.payment_status,
          invoice_date: formData.invoice_date,
          due_date: formData.due_date || null,
          subtotal: totals.subtotal,
          tax_amount: totals.taxAmount,
          total_amount: totals.total,
          notes: formData.notes || null,
          user_id: user.id,
          company_id: selectedCompany.company_name
        }])
        .select()
        .single();

      // Handle duplicate error from DB (race condition). If auto-generated, regenerate and retry once.
      if (invoiceError) {
        if ((invoiceError as any).code === '23505') {
          // Duplicate invoice number error
          if (!formData.custom_invoice_number) {
            invoiceNumber = generateInvoiceNumber();
            const retry = await supabase
              .from('invoices')
              .insert([{ 
                invoice_number: invoiceNumber,
                custom_invoice_number: formData.custom_invoice_number || null,
                entity_id: formData.entity_id || null,
                entity_type: formData.entity_type,
                invoice_type: formData.invoice_type,
                payment_status: formData.payment_status,
                invoice_date: formData.invoice_date,
                due_date: formData.due_date || null,
                subtotal: totals.subtotal,
                tax_amount: totals.taxAmount,
                total_amount: totals.total,
                discount_amount: formData.discount_amount || 0,
                discount_percentage: formData.discount_percentage || 0,
                notes: formData.notes || null,
                user_id: user.id,
                company_id: selectedCompany.company_name
              }])
              .select()
              .single();

            if (retry.error) {
              console.error('Retry invoice creation error:', retry.error);
              throw retry.error;
            }
            // Overwrite invoice with retry data
            invoice = retry.data as any;
          } else {
            // Custom numbers should not auto-resolve; show friendly message
            toast({
              title: "Duplicate Invoice Number",
              description: "This invoice number already exists. Please enter a different number.",
              variant: "destructive"
            });
            return;
          }
        } else {
          // Other database errors
          console.error('Invoice creation error:', invoiceError);
          throw invoiceError;
        }
      } else {
        // Assign invoice data when there's no error
        invoice = invoiceData;
      }

      // Validate invoice was created
      if (!invoice || !invoice.id) {
        throw new Error('Invoice was created but no ID was returned');
      }

      // Create invoice items (include product_id for inventory tracking)
      // Only include items with valid description and quantity > 0
      const itemsToInsert = validLineItems.map(item => ({
        invoice_id: invoice.id,
        product_id: item.product_id || null, // Store product_id for inventory tracking
        description: item.description.trim(),
        quantity: item.quantity,
        unit_price: item.unit_price,
        gst_rate: item.gst_rate,
        line_total: item.quantity * item.unit_price
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error('Error creating invoice items:', itemsError);
        throw new Error(`Failed to create invoice items: ${itemsError.message || 'Unknown error'}`);
      }

      // Update inventory based on invoice type
      // IMPORTANT: Update inventory for:
      // - Customer invoices (sales, sale_return) when entity_type === 'customer'
      // - Supplier invoices (purchase, purchase_return) when entity_type === 'supplier'
      // Transport, wholesale, labour, and other categories don't need inventory sync
      let inventoryUpdatesSuccess = 0;
      let inventoryUpdatesFailed = 0;
      
      // Update inventory for customer invoices (sales/sale_return) or supplier invoices (purchase/purchase_return)
      const shouldUpdateInventory = 
        (formData.entity_type === 'customer' && (formData.invoice_type === 'sales' || formData.invoice_type === 'sale_return')) ||
        (formData.entity_type === 'supplier' && (formData.invoice_type === 'purchase' || formData.invoice_type === 'purchase_return'));
      
      if (shouldUpdateInventory) {
        for (const item of validLineItems) {
          try {
            let productId: string | undefined = item.product_id;
            let productName = item.description;
            
            // If no product_id, try to find product by name (case-insensitive, trimmed)
            if (!productId) {
              const product = products.find(p => 
                p.name.toLowerCase().trim() === item.description.toLowerCase().trim()
              );
              if (product) {
                productId = product.id;
                productName = product.name;
              }
            }
            
            // Only update inventory if we found a product (by ID or name)
            if (productId) {
              // Fetch current stock with product name for better error messages
              let query: any = supabase
                .from('products')
                .select('current_stock, name')
                .eq('id', productId);
              
              // Add company filter if available
              if (selectedCompany?.company_name) {
                query = query.eq('company_id', selectedCompany.company_name);
              }
              
              const { data: productData, error: fetchErr } = await query.single();
              
              if (fetchErr || !productData) {
                console.error('Error fetching product stock:', fetchErr);
                inventoryUpdatesFailed++;
                toast({
                  title: "Warning",
                  description: `Could not fetch stock for ${productName}: ${fetchErr?.message || 'Product not found'}`,
                  variant: "destructive"
                });
                continue;
              }
              
              // Calculate stock change based on invoice type
              let delta = 0;
              if (formData.invoice_type === 'sales') {
                delta = -item.quantity; // Sales reduces stock (customer invoice)
              } else if (formData.invoice_type === 'purchase') {
                delta = item.quantity; // Purchase increases stock
              } else if (formData.invoice_type === 'sale_return') {
                delta = item.quantity; // Sale return increases stock (reverses sale)
              } else if (formData.invoice_type === 'purchase_return') {
                delta = -item.quantity; // Purchase return decreases stock (reverses purchase)
              }
              
              // Ensure stock doesn't go negative (for sales)
              const newStock = productData.current_stock + delta;
              if (newStock < 0 && formData.invoice_type === 'sales') {
                inventoryUpdatesFailed++;
                toast({
                  title: "Insufficient Stock",
                  description: `${productData.name || productName} has only ${productData.current_stock} in stock, but ${item.quantity} requested. Inventory not updated.`,
                  variant: "destructive"
                });
                continue;
              }
              
              // Update inventory
              let updateQuery: any = supabase
                .from('products')
                .update({ current_stock: newStock })
                .eq('id', productId);
              
              if (selectedCompany?.company_name) {
                updateQuery = updateQuery.eq('company_id', selectedCompany.company_name);
              }
              
              const { error: updateError } = await updateQuery;
              
              if (updateError) {
                console.error('Error updating inventory:', updateError);
                inventoryUpdatesFailed++;
                toast({
                  title: "Warning",
                  description: `Failed to update inventory for ${productData.name || productName}`,
                  variant: "destructive"
                });
              } else {
                inventoryUpdatesSuccess++;
                console.log(`✅ Inventory updated: ${productData.name || productName} ${delta > 0 ? '+' : ''}${delta} (New stock: ${newStock})`);
              }
            } else {
              // Product not found in inventory - this is okay for manual entries
              console.log(`ℹ️ Product "${item.description}" not found in inventory - skipping stock update`);
            }
          } catch (invError) {
            console.error('Error updating inventory for item:', item, invError);
            inventoryUpdatesFailed++;
            toast({
              title: "Warning",
              description: `Error updating inventory for ${item.description}`,
              variant: "destructive"
            });
            // Continue with other items even if one fails
          }
        }
        
        // Show summary if there were any updates
        if (inventoryUpdatesSuccess > 0) {
          toast({
            title: "Inventory Updated",
            description: `Successfully updated inventory for ${inventoryUpdatesSuccess} item(s)${inventoryUpdatesFailed > 0 ? `. ${inventoryUpdatesFailed} failed.` : '.'}`,
          });
        }
      } else {
        // For non-inventory invoices (transport, wholesale, labour, other), skip inventory updates
        console.log(`ℹ️ Skipping inventory update for ${formData.entity_type} invoice (${formData.invoice_type}) - inventory sync only applies to customer/supplier invoices`);
      }

      // Create GST entry automatically (skip for return/refund invoices - treat as void)
      const isReturnInvoice = formData.invoice_type === 'sale_return' || formData.invoice_type === 'purchase_return';
      
      if (!isReturnInvoice) {
        // Only create GST entries for regular invoices, not returns/refunds (void transactions)
        try {
          // Get entity details for GST calculation
          const entityDetails = await GSTSyncService.getEntityDetails(
            formData.entity_id || '', 
            formData.entity_type as any
          );

          // Determine transaction type for GST entry
          let gstTransactionType: 'sale' | 'purchase' = 'sale';
          if (formData.invoice_type === 'sales') {
            gstTransactionType = 'sale';
          } else {
            gstTransactionType = 'purchase';
          }

          const invoiceGSTData = {
            invoice_id: invoice.id,
            invoice_number: invoiceNumber,
            invoice_date: formData.invoice_date,
            transaction_type: gstTransactionType,
            entity_name: (entityDetails as any)?.company_name || (entityDetails as any)?.name || (formData.entity_type === 'other' ? 'Miscellaneous' : 'Unknown'),
            entity_id: formData.entity_id || '',
            subtotal: totals.subtotalAfterDiscount, // Use subtotal after discount for GST calculation
            tax_amount: totals.taxAmount,
            total_amount: totals.total,
            from_state: (entityDetails as any)?.state || '27',
            to_state: companyState,
            forceIGST: forceIGST, // Pass the forceIGST flag
            line_items: lineItems.map(item => ({
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              gst_rate: item.gst_rate,
              line_total: item.quantity * item.unit_price
            }))
          };

          const gstResult = await GSTSyncService.createGSTEntryFromInvoice(invoiceGSTData);
          if (gstResult.success) {
            toast({ 
              title: "Success", 
              description: "Invoice created and GST entry added successfully" 
            });
          } else {
            toast({ 
              title: "Warning", 
              description: "Invoice created but GST entry failed: " + gstResult.error,
              variant: "destructive"
            });
          }
        } catch (gstError) {
          console.error('GST sync error:', gstError);
          toast({ 
            title: "Warning", 
            description: "Invoice created but GST entry failed",
            variant: "destructive"
          });
        }
      } else {
        // Return/refund invoice - treated as void, no GST entry created
        toast({ 
          title: "Success", 
          description: "Return/Refund invoice created (treated as void - excluded from calculations)" 
        });
      }
      
      resetForm();
      fetchInvoices();
    } catch (error: any) {
      console.error('Invoice creation error:', error);
      const errorMessage = error?.message || error?.details || error?.hint || 'Failed to create invoice';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id: string) => {
    setInvoiceToDelete(id);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!invoiceToDelete) return;
    
    try {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceToDelete);

      if (error) throw error;
      toast({ title: "Success", description: "Invoice deleted successfully" });
      fetchInvoices();
      setShowDeleteDialog(false);
      setInvoiceToDelete(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete invoice",
        variant: "destructive"
      });
    }
  };

  const [invoiceGSTBreakdown, setInvoiceGSTBreakdown] = useState<{
    cgst: number;
    sgst: number;
    igst: number;
    total_gst: number;
  } | null>(null);

  const viewInvoice = async (invoice: Invoice) => {
    try {
      const { data, error } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoice.id);

      if (error) throw error;
      setInvoiceItems(data || []);
      setSelectedInvoice(invoice);
      
      // Fetch GST breakdown from gst_entries
      const { data: gstData, error: gstError } = await supabase
        .from('gst_entries' as any)
        .select('cgst, sgst, igst, total_gst')
        .eq('invoice_id', invoice.id)
        .maybeSingle();
      
      if (gstError) {
        console.error('Error fetching GST breakdown:', gstError);
      } else if (gstData) {
        const gst = gstData as any;
        setInvoiceGSTBreakdown({
          cgst: gst.cgst || 0,
          sgst: gst.sgst || 0,
          igst: gst.igst || 0,
          total_gst: gst.total_gst || 0
        });
      } else {
        setInvoiceGSTBreakdown(null);
      }
      
      setViewOpen(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load invoice details",
        variant: "destructive"
      });
    }
  };

  const downloadInvoice = async (invoice: Invoice) => {
    try {
      // Fetch invoice items first
      const { data: items, error } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoice.id);

      if (error) throw error;
      
      // Fetch GST breakdown from gst_entries
      const { data: gstData } = await supabase
        .from('gst_entries' as any)
        .select('cgst, sgst, igst, total_gst')
        .eq('invoice_id', invoice.id)
        .maybeSingle();
      
      // Fetch company info from profile - use selected company, not first one
      const { data: profileData } = await supabase
        .from('profiles')
        .select('business_entities')
        .eq('id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      // Find the selected company in the business_entities array
      let companyInfo: any;
      if (profileData?.business_entities && Array.isArray(profileData.business_entities) && selectedCompany) {
        const businessEntity = profileData.business_entities.find(
          (entity: any) => entity.company_name === selectedCompany.company_name
        );
        
        if (businessEntity) {
          companyInfo = businessEntity;
        } else {
          // If company not found in array, use selectedCompany data
          companyInfo = {
            company_name: selectedCompany.company_name || "Your Company Name",
            address: selectedCompany.address || "Your Company Address",
            phone: selectedCompany.phone || selectedCompany.owner_phone || "Your Phone",
            owner_phone: selectedCompany.owner_phone || "Your Phone",
            gst: selectedCompany.gst || selectedCompany.gstin || "Your GSTIN",
            email: selectedCompany.email || ""
          };
        }
      } else {
        // Fallback if no business entities found or no selected company
        companyInfo = {
          company_name: selectedCompany?.company_name || "Your Company Name",
          address: selectedCompany?.address || "Your Company Address",
          phone: selectedCompany?.phone || selectedCompany?.owner_phone || "Your Phone",
          owner_phone: selectedCompany?.owner_phone || "Your Phone",
          gst: selectedCompany?.gst || selectedCompany?.gstin || "Your GSTIN",
          email: selectedCompany?.email || ""
        };
      }
      
      // Get user email for company info
      const { data: { user } } = await supabase.auth.getUser();
      
      // Generate and download PDF
      const pdfDoc = (
        <InvoicePDF 
          invoice={invoice} 
          items={items || []} 
          companyInfo={{
            name: companyInfo.company_name || "Your Company Name",
            address: companyInfo.address || "Your Company Address",
            phone: companyInfo.phone || companyInfo.owner_phone || "Your Phone",
            email: companyInfo.email || user?.email || "your@email.com",
            gstin: companyInfo.gst || companyInfo.gstin || "Your GSTIN"
          }}
          gstBreakdown={gstData ? {
            cgst: (gstData as any).cgst || 0,
            sgst: (gstData as any).sgst || 0,
            igst: (gstData as any).igst || 0,
            total_gst: (gstData as any).total_gst || 0
          } : undefined}
        />
      );
      
      const blob = await pdf(pdfDoc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${invoice.invoice_number}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast({ title: "Success", description: "Invoice PDF downloaded successfully" });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download invoice",
        variant: "destructive"
      });
    }
  };

  const openPaymentDialog = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowPaymentDialog(true);
    await fetchInvoicePayments(invoice.id);
    setPaymentData({
      amount: 0,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'cash',
      notes: ''
    });
  };

  const recordPayment = async () => {
    if (!selectedInvoice) return;

    if (paymentData.amount <= 0) {
      toast({
        title: "Error",
        description: "Payment amount must be greater than 0",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Calculate total paid so far
      const totalPaid = invoicePayments.reduce((sum, p) => sum + p.amount, 0);
      const newTotalPaid = totalPaid + paymentData.amount;

      // Record the payment
      const { error: paymentError } = await supabase
        .from('invoice_payments' as any)
        .insert([{
          invoice_id: selectedInvoice.id,
          amount: paymentData.amount,
          payment_date: paymentData.payment_date,
          payment_method: paymentData.payment_method,
          notes: paymentData.notes || null,
          user_id: user.id
        }]);

      if (paymentError) throw paymentError;

      // Update invoice payment status
      let newPaymentStatus = 'partial';
      if (newTotalPaid >= selectedInvoice.total_amount) {
        newPaymentStatus = 'paid';
      } else if (newTotalPaid > 0) {
        newPaymentStatus = 'partial';
      } else {
        newPaymentStatus = 'due';
      }

      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({ 
          payment_status: newPaymentStatus,
          status: newPaymentStatus === 'paid' ? 'paid' : 'sent'
        })
        .eq('id', selectedInvoice.id);

      if (invoiceError) throw invoiceError;

      toast({ 
        title: "Success", 
        description: `Payment of ${formatIndianCurrency(paymentData.amount)} recorded successfully` 
      });

      await fetchInvoicePayments(selectedInvoice.id);
      fetchInvoices();
      
      // Reset payment form
      setPaymentData({
        amount: 0,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash',
        notes: ''
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to record payment",
        variant: "destructive"
      });
    }
  };

  const updatePaymentStatus = async (invoiceId: string, newStatus: string) => {
    // Prevent paid invoices from being changed
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (invoice?.payment_status === 'paid' && (newStatus === 'partial' || newStatus === 'due')) {
      toast({
        title: "Error",
        description: "Paid invoices cannot be marked as partial or due",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('invoices')
        .update({ 
          payment_status: newStatus,
          status: newStatus === 'paid' ? 'paid' : 'sent'
        })
        .eq('id', invoiceId);

      if (error) throw error;
      
      toast({ 
        title: "Success", 
        description: `Payment status updated to ${newStatus}` 
      });
      fetchInvoices();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update payment status",
        variant: "destructive"
      });
    }
  };

  const updateInvoiceStatus = async (invoiceId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ payment_status: newStatus })
        .eq('id', invoiceId);

      if (error) throw error;

      // Update corresponding GST entry
      const gstResult = await GSTSyncService.updateGSTEntryFromInvoice(
        invoiceId, 
        newStatus,
        newStatus === 'paid' ? new Date().toISOString().split('T')[0] : undefined
      );

      if (gstResult.success) {
        toast({ 
          title: "Success", 
          description: "Invoice status updated and GST entry synced" 
        });
      } else {
        toast({ 
          title: "Warning", 
          description: "Invoice status updated but GST sync failed: " + gstResult.error,
          variant: "destructive"
        });
      }

      fetchInvoices();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update invoice status",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      entity_id: "",
      entity_type: "customer",
      invoice_type: "sales",
      custom_invoice_number: "",
      payment_status: "due",
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: "",
      notes: "",
      discount_amount: 0,
      discount_percentage: 0
    });
    setLineItems([{
      product_id: undefined,
      description: "",
      quantity: 1,
      unit_price: 0,
      gst_rate: 18,
      max_quantity: undefined
    }]);
    setForceIGST(false);
    setApplyTaxOnSubtotal(false);
    setSubtotalTaxRate(18);
    setShowNewEntityForm(false);
    setSelectedPO("");
    setPOItems([]);
    setOpen(false);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, {
      product_id: undefined,
      description: "",
      quantity: 1,
      unit_price: 0,
      gst_rate: 18,
      max_quantity: undefined
    }]);
  };

  const removeLineItem = (index: number) => {
    // If only one item, clear it instead of removing
    if (lineItems.length === 1) {
      setLineItems([{
        product_id: undefined,
        description: "",
        quantity: 1,
        unit_price: 0,
        gst_rate: 18,
        max_quantity: undefined
      }]);
    } else {
    setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  // Check if description matches any product
  const checkProductExists = (description: string): boolean => {
    if (!description || !description.trim()) return false;
    const trimmedDesc = description.trim().toLowerCase();
    return products.some(p => p.name.toLowerCase() === trimmedDesc);
  };


  // Create product from invoice item
  const createProductFromItem = async () => {
    if (!pendingProductItem) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const productName = pendingProductItem.description.trim();
      const productNameLower = productName.toLowerCase();

      // Check for duplicate product name
      // @ts-expect-error - TypeScript has issues with deep type inference on Supabase queries
      const { data: existingProducts, error: checkError } = await supabase
        .from('products')
        .select('id, name')
        .eq('company_id', selectedCompany?.company_name || '')
        .eq('user_id', user.id)
        .ilike('name', productName);

      if (checkError) {
        console.error('Error checking duplicates:', checkError);
      }

      const duplicate = existingProducts?.some(p => 
        p.name.trim().toLowerCase() === productNameLower
      );

      if (duplicate) {
        toast({
          title: "Duplicate Product",
          description: `A product with the name "${productName}" already exists in this company. Please select it from the product dropdown instead.`,
          variant: "destructive"
        });
        setShowAddProductDialog(false);
        setPendingProductItem(null);
        return;
      }

      const productData = {
        name: productName,
        description: pendingProductItem.description,
        selling_price: pendingProductItem.unit_price || null,
        purchase_price: null,
        gst_rate: pendingProductItem.gst_rate || 18,
        current_stock: 0,
        min_stock_level: 0,
        unit: 'Nos',
        user_id: user.id,
        company_id: selectedCompany?.company_name || null
      };

      const { data: newProduct, error } = await supabase
        .from('products')
        .insert([productData])
        .select()
        .single();

      if (error) throw error;

      // Update products list
      setProducts(prev => [...prev, newProduct]);

      // Link the product to the line item
      updateLineItem(pendingProductItem.index, 'product_id', newProduct.id);

      toast({
        title: "Product Added",
        description: `${newProduct.name} has been added to your inventory`
      });

      setShowAddProductDialog(false);
      setPendingProductItem(null);
      fetchProducts(); // Refresh products list
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create product",
        variant: "destructive"
      });
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'default';
      case 'due': return 'secondary';
      case 'partial': return 'outline';
      case 'overdue': return 'destructive';
      default: return 'outline';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'default';
      case 'sent': return 'secondary';
      case 'draft': return 'outline';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading invoices...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Invoices</h2>
          <p className="text-muted-foreground">Create and manage invoices for your business</p>
        </div>
        
        <Dialog open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (isOpen) {
            // Reset form but preserve invoice type, then refresh POs if needed
            const currentInvoiceType = formData.invoice_type;
            // Reset form fields without closing dialog
            setFormData({
              entity_id: "",
              entity_type: "customer",
              invoice_type: currentInvoiceType, // Preserve invoice type
              custom_invoice_number: "",
              payment_status: "due",
              invoice_date: new Date().toISOString().split('T')[0],
              due_date: "",
              notes: "",
              discount_amount: 0,
              discount_percentage: 0
            });
            setLineItems([{
              product_id: undefined,
              description: "",
              quantity: 1,
              unit_price: 0,
              gst_rate: 18,
              max_quantity: undefined
            }]);
            setForceIGST(false);
            setApplyTaxOnSubtotal(false);
            setSubtotalTaxRate(18);
            setShowNewEntityForm(false);
            setSelectedPO("");
            setPOItems([]);
            // Refresh POs when dialog opens if it's a purchase type
            if (currentInvoiceType === 'purchase' || currentInvoiceType === 'purchase_return') {
              fetchPurchaseOrders(currentInvoiceType);
            }
          }
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              // Refresh POs when opening dialog if it's a purchase type
              if (formData.invoice_type === 'purchase' || formData.invoice_type === 'purchase_return') {
                fetchPurchaseOrders(formData.invoice_type);
              }
            }}>
              <Plus className="w-4 h-4 mr-2" />
              Create Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl h-[95vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
              <DialogTitle>Create New Invoice</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar-dark smooth-scroll px-6 py-4 space-y-6 min-h-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="invoice_type">Invoice Type</Label>
                  <Select value={formData.invoice_type} onValueChange={(value) => {
                    setFormData(prev => ({ ...prev, invoice_type: value }));
                    setSelectedPO("");
                    setPOItems([]);
                    setLineItems([{
                      product_id: undefined,
                      description: "",
                      quantity: 1,
                      unit_price: 0,
                      gst_rate: 18
                    }]);
                    if (value === 'purchase' || value === 'purchase_return') {
                      fetchPurchaseOrders(value);
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select invoice type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Sales Invoice</SelectItem>
                      <SelectItem value="purchase">Purchase Invoice</SelectItem>
                      <SelectItem value="sale_return">Sale Return/Refund</SelectItem>
                      <SelectItem value="purchase_return">Purchase Return/Refund</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="payment_status">Payment Status</Label>
                  <Select value={formData.payment_status} onValueChange={(value) => setFormData(prev => ({ ...prev, payment_status: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="due">Due</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="custom_invoice_number">Custom Invoice Number (Optional)</Label>
                  <Input
                    id="custom_invoice_number"
                    value={formData.custom_invoice_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, custom_invoice_number: e.target.value }))}
                    placeholder="Enter custom invoice number"
                  />
                </div>
                <div>
                  <Label htmlFor="entity_type">Entity Type</Label>
                  <Select value={formData.entity_type} onValueChange={(value) => {
                    // Clear PO selection if switching to non-supplier/non-wholesaler entity type
                    if (value !== 'supplier' && value !== 'wholesaler') {
                      setSelectedPO("");
                      setPOItems([]);
                    }
                    setFormData(prev => ({ ...prev, entity_type: value, entity_id: "" }));
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select entity type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="wholesaler">Wholesaler</SelectItem>
                      <SelectItem value="transport">Transport</SelectItem>
                      <SelectItem value="labour">Labour</SelectItem>
                      <SelectItem value="other">Other / Miscellaneous</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* IGST Override Option */}
              <div className="flex items-center space-x-2 p-3 border rounded-md bg-muted/50">
                <input
                  type="checkbox"
                  id="forceIGST"
                  checked={forceIGST}
                  onChange={(e) => setForceIGST(e.target.checked)}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
                />
                <Label htmlFor="forceIGST" className="font-normal cursor-pointer text-sm">
                  Force IGST (Apply full tax % as IGST regardless of state)
                </Label>
              </div>

              <div>
                <Label>Business Entity {formData.entity_type === 'customer' ? '*' : '(Optional)'}</Label>
                <div className="flex gap-2">
                  <Select value={formData.entity_id || "open-items"} onValueChange={(value) => {
                    if (value === "open-items") {
                      setFormData(prev => ({ ...prev, entity_id: "" }));
                    } else {
                      setFormData(prev => ({ ...prev, entity_id: value }));
                    }
                  }}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={formData.entity_type === 'customer' ? "Select entity" : "Select entity or use Billing Name"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] custom-scrollbar-dark">
                      {/* Billing Name option for non-customer invoices */}
                      {formData.entity_type !== 'customer' && (
                        <SelectItem value="open-items">
                          <span className="flex items-center gap-2">
                            <span className="font-medium">Billing Name</span>
                            <span className="text-xs text-muted-foreground">(No specific entity)</span>
                          </span>
                        </SelectItem>
                      )}
                      {businessEntities.length === 0 ? (
                        <SelectItem value="no-entities" disabled>
                          No entities found. Click + to add one.
                        </SelectItem>
                      ) : businessEntities
                        .filter(entity => entity.entity_type === formData.entity_type)
                        .length === 0 ? (
                        <SelectItem value="no-entities-type" disabled>
                          No {formData.entity_type}s found. Click + to add one.
                        </SelectItem>
                      ) : (
                        businessEntities
                          .filter(entity => entity.entity_type === formData.entity_type)
                          .map((entity) => (
                            <SelectItem key={entity.id} value={entity.id}>
                              {entity.name} ({entity.entity_type})
                            </SelectItem>
                          ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowNewEntityForm(!showNewEntityForm)}
                    title={`Add new ${formData.entity_type}`}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {formData.entity_type !== 'customer' && !formData.entity_id && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Billing Name: Invoice will be created without a specific {formData.entity_type} entity
                  </p>
                )}
              </div>

              {/* Purchase Order Selection for Purchase Invoice and Purchase Return */}
              {/* PO selection only available for suppliers and wholesalers */}
              {(formData.invoice_type === 'purchase' || formData.invoice_type === 'purchase_return') && 
               (formData.entity_type === 'supplier' || formData.entity_type === 'wholesaler') && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="purchase_order">Purchase Order {formData.invoice_type === 'purchase_return' ? '(Select PO to return)' : '(Select PO to invoice)'}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => fetchPurchaseOrders(formData.invoice_type)}
                      className="h-8 text-xs"
                      title="Refresh PO list"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Refresh
                    </Button>
                  </div>
                  <Select 
                    value={selectedPO} 
                    onValueChange={async (value) => {
                      setSelectedPO(value);
                      if (value) {
                        await loadPOItems(value);
                        const po = purchaseOrders.find(p => p.id === value);
                        if (po && po.supplier_id) {
                          // Try to find matching business entity with supplier type
                          const matchingEntity = businessEntities.find(
                            e => e.entity_type === 'supplier' && e.id === po.supplier_id
                          );
                          if (matchingEntity) {
                            setFormData(prev => ({ 
                              ...prev, 
                              entity_type: 'supplier',
                              entity_id: matchingEntity.id
                            }));
                          } else {
                            // Set entity type to supplier, but let user select the entity
                            // since supplier_id might not match entity_id
                            setFormData(prev => ({ 
                              ...prev, 
                              entity_type: 'supplier',
                              entity_id: ""
                            }));
                            toast({
                              title: "Info",
                              description: "Please select the supplier from the Business Entity dropdown",
                            });
                          }
                        }
                      } else {
                        setPOItems([]);
                        setLineItems([{
                          product_id: undefined,
                          description: "",
                          quantity: 1,
                          unit_price: 0,
                          gst_rate: 18
                        }]);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={formData.invoice_type === 'purchase_return' ? "Select PO to return..." : "Select PO to create invoice..."} />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {purchaseOrders.length === 0 ? (
                        <SelectItem value="no-pos" disabled>
                          {formData.invoice_type === 'purchase_return' 
                            ? 'No purchase orders available for return' 
                            : 'No received/partial purchase orders available'}
                        </SelectItem>
                      ) : (
                        purchaseOrders.map((po) => {
                          const isNew = po.created_at && new Date(po.created_at) > new Date(Date.now() - 3600000);
                          const isDraftOrSent = po.status === 'draft' || po.status === 'sent';
                          return (
                            <SelectItem key={po.id} value={po.id}>
                              <span className="flex items-center gap-2">
                                {po.po_number} - {po.suppliers?.company_name || 'No supplier'} 
                                <Badge variant={po.status === 'received' ? 'default' : po.status === 'partial' ? 'secondary' : 'outline'} className="text-xs">
                                  {po.status.toUpperCase()}
                                </Badge>
                                - {formatIndianCurrency(po.total_amount)}
                                {isNew && (
                                  <Badge variant="default" className="text-xs bg-primary">NEW</Badge>
                                )}
                                {isDraftOrSent && formData.invoice_type === 'purchase' && (
                                  <span className="text-xs text-muted-foreground">(Not yet received)</span>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                  {selectedPO && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.invoice_type === 'purchase_return' 
                        ? 'Selected PO items will be populated for return/refund'
                        : 'Selected PO items will be populated for invoice creation'}
                    </p>
                  )}
                </div>
              )}

              {showNewEntityForm && (
                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="font-medium">Add New {formData.entity_type}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="new_entity_name">Name</Label>
                      <Input
                        id="new_entity_name"
                        value={newEntityData.name}
                        onChange={(e) => setNewEntityData(prev => ({ ...prev, name: e.target.value, entity_type: formData.entity_type }))}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="new_entity_contact">Contact Person</Label>
                      <Input
                        id="new_entity_contact"
                        value={newEntityData.contact_person}
                        onChange={(e) => setNewEntityData(prev => ({ ...prev, contact_person: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="new_entity_phone">Phone</Label>
                      <Input
                        id="new_entity_phone"
                        value={newEntityData.phone}
                        onChange={(e) => setNewEntityData(prev => ({ ...prev, phone: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="new_entity_email">Email</Label>
                      <Input
                        id="new_entity_email"
                        type="email"
                        value={newEntityData.email}
                        onChange={(e) => setNewEntityData(prev => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="new_entity_address">Address</Label>
                      <Input
                        id="new_entity_address"
                        value={newEntityData.address}
                        onChange={(e) => setNewEntityData(prev => ({ ...prev, address: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="new_entity_gstin">GSTIN</Label>
                      <Input
                        id="new_entity_gstin"
                        value={newEntityData.gstin}
                        onChange={(e) => setNewEntityData(prev => ({ ...prev, gstin: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => {
                      setShowNewEntityForm(false);
                      setNewEntityData({
                        name: "",
                        entity_type: formData.entity_type === 'other' ? 'other' : formData.entity_type,
                        contact_person: "",
                        phone: "",
                        email: "",
                        address: "",
                        gstin: ""
                      });
                    }}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={createNewEntity} disabled={!newEntityData.name.trim()}>
                      Create {formData.entity_type}
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="invoice_date">Invoice Date</Label>
                  <DateInput
                    id="invoice_date"
                    value={formData.invoice_date}
                    onChange={(value) => setFormData(prev => ({ ...prev, invoice_date: value }))}
                    placeholder="Select invoice date"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="due_date">Due Date</Label>
                  <DateInput
                    id="due_date"
                    value={formData.due_date}
                    onChange={(value) => setFormData(prev => ({ ...prev, due_date: value }))}
                    placeholder="Select due date"
                  />
                </div>
              </div>


              <div>
                <div className="flex justify-between items-center mb-4">
                  <Label>Line Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </Button>
                </div>
                
                {/* Info message for non-customer invoices */}
                {formData.entity_type !== 'customer' && (
                  <div className="border rounded-lg p-3 mb-3 bg-blue-50 dark:bg-blue-950/20">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>Free-form Billing:</strong> For {formData.entity_type} invoices, you can type any item/service description directly. 
                      No need to select from inventory. Just enter the service name, description, quantity, price, and GST rate.
                    </p>
                  </div>
                )}
                
                {lineItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-start mb-4 p-3 border rounded-lg bg-muted/30">
                    {/* Product selection - Show for all invoice types, but optional for non-customer */}
                    <div className="col-span-3">
                        <Label className="text-sm mb-1 block">Product</Label>
                        <div className="space-y-2">
                          {/* Search Input */}
                          <Input
                            placeholder="Search products or select Manual Entry..."
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            className="mb-2"
                          />
                          
                          <Select 
                            value={item.product_id || "__manual__"}
                            disabled={products.length === 0}
                            onValueChange={(value) => {
                            if (value === 'no-products' || value === 'no-low-stock' || value === '__manual__') {
                              // Clear product selection
                              const updated = [...lineItems];
                              updated[index] = { ...updated[index], product_id: undefined };
                              // Only clear description if it matches a product name
                              const currentProduct = item.product_id ? products.find(p => p.id === item.product_id) : null;
                              if (currentProduct && item.description === currentProduct.name) {
                                updated[index].description = '';
                              }
                              updated[index].unit_price = 0;
                              updated[index].gst_rate = 18;
                              setLineItems(updated);
                              return;
                            }
                            
                            const product = products.find(p => p.id === value);
                            if (product) {
                              // Calculate selling price - handle null, undefined, and ensure it's a number
                              let sellingPrice = 0;
                              if (product.selling_price != null) {
                                const priceValue = product.selling_price;
                                if (typeof priceValue === 'number') {
                                  sellingPrice = priceValue;
                                } else if (typeof priceValue === 'string') {
                                  sellingPrice = parseFloat(priceValue) || 0;
                                } else {
                                  sellingPrice = Number(priceValue) || 0;
                                }
                              }
                              
                              // Update all fields in one operation to avoid multiple state updates
                              const updated = [...lineItems];
                              const currentItem = { ...updated[index] }; // Copy current item
                              
                              // Store product_id
                              updated[index].product_id = value;
                              
                              // Auto-fill description if it's empty or matches previous product
                              const previousProduct = currentItem.product_id ? products.find(p => p.id === currentItem.product_id) : null;
                              const wasAutoFilled = previousProduct && currentItem.description === previousProduct.name;
                              
                              if (!currentItem.description || currentItem.description.trim() === '' || wasAutoFilled) {
                                updated[index].description = product.name;
                              }
                              
                              // Auto-fill price and GST rate - always set these
                              updated[index].unit_price = sellingPrice;
                              updated[index].gst_rate = product.gst_rate || 18;
                              
                              // Force state update by creating a new array reference
                              setLineItems(updated);
                              
                              // Focus on price field after a short delay so user can confirm/modify
                              setTimeout(() => {
                                const priceInput = document.getElementById(`price-${index}`) as HTMLInputElement;
                                if (priceInput) {
                                  priceInput.focus();
                                  priceInput.select();
                                }
                              }, 150);
                            }
                          }}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder={products.length === 0 ? "No products available" : "Select product (optional)"} />
                          </SelectTrigger>
                        <SelectContent 
                          className="z-[100] max-h-[400px] custom-scrollbar-dark" 
                          position="popper"
                          sideOffset={4}
                        >
                          <SelectItem value="__manual__">Manual Entry</SelectItem>
                          {(() => {
                            // Filter products based on search term
                            let filteredProducts = products;
                            
                            // Apply search filter if search term exists
                            if (productSearch.trim()) {
                              const searchTerm = productSearch.toLowerCase().trim();
                              filteredProducts = filteredProducts.filter(p => {
                                const name = p.name?.toLowerCase() || '';
                                const desc = p.description?.toLowerCase() || '';
                                const sku = p.sku?.toLowerCase() || '';
                                const stock = String(p.current_stock || 0);
                                const price = p.selling_price ? String(p.selling_price) : '';
                                const hsn = p.hsn_code?.toLowerCase() || '';
                                return name.includes(searchTerm) || 
                                       desc.includes(searchTerm) ||
                                       sku.includes(searchTerm) ||
                                       stock.includes(searchTerm) || 
                                       price.includes(searchTerm) ||
                                       hsn.includes(searchTerm);
                              });
                            }
                            
                            if (products.length === 0) {
                              return (
                                <SelectItem value="no-products" disabled>
                                  No products available
                                </SelectItem>
                              );
                            }
                            
                            if (filteredProducts.length === 0) {
                              return (
                                <SelectItem value="no-matches" disabled>
                                  {productSearch ? `No products match "${productSearch}"` : 'No products match your filters'}
                                </SelectItem>
                              );
                            }
                            
                            return filteredProducts.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name} {(product.current_stock !== undefined) ? ` (Stock: ${product.current_stock})` : ''} 
                                {product.selling_price ? ` - ₹${product.selling_price.toFixed(2)}` : ''}
                              </SelectItem>
                            ));
                          })()}
                        </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {/* Description field with autocomplete - Expand to col-span-4 or col-span-6 for non-customer invoices */}
                    <div className={formData.entity_type === 'customer' ? "col-span-3" : "col-span-6"}>
                      <Label htmlFor={`description-${index}`} className="text-sm mb-1 block">
                        {formData.entity_type === 'customer' ? 'Description' : 'Item/Service Description'} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`description-${index}`}
                        placeholder={formData.entity_type === 'customer' ? "Type item name or description" : "Type any service/item name (e.g., Transport charges, Labour charges, Wholesale service, etc.)"}
                        value={item.description}
                        onChange={(e) => {
                          const value = e.target.value;
                          updateLineItem(index, 'description', value);
                        }}
                        onFocus={(e) => e.target.select()}
                        required
                        className={!item.description ? "border-destructive" : ""}
                      />
                      {!item.description && (
                        <p className="text-xs text-destructive mt-1">Description is required</p>
                      )}
                      {formData.entity_type !== 'customer' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Enter any service name, item description, or billing detail as needed
                        </p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor={`quantity-${index}`} className="text-sm mb-1 block">
                        Quantity
                        {(formData.invoice_type === 'sale_return' || formData.invoice_type === 'purchase_return') && item.max_quantity && (
                          <span className="text-xs text-muted-foreground ml-1">(Max: {item.max_quantity})</span>
                        )}
                      </Label>
                      <Input
                        id={`quantity-${index}`}
                        type="number"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => {
                          let qty = parseFloat(e.target.value) || 0;
                          // For return invoices, enforce max quantity
                          if ((formData.invoice_type === 'sale_return' || formData.invoice_type === 'purchase_return') && item.max_quantity) {
                            qty = Math.min(qty, item.max_quantity);
                          }
                          updateLineItem(index, 'quantity', qty);
                        }}
                        min="0"
                        max={item.max_quantity}
                        step="0.01"
                        required
                      />
                      {(formData.invoice_type === 'sale_return' || formData.invoice_type === 'purchase_return') && item.max_quantity && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Original quantity: {item.max_quantity}. Set to 0 to skip this item.
                        </p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor={`price-${index}`} className="text-sm mb-1 block">Unit Price</Label>
                      <Input
                        id={`price-${index}`}
                        type="number"
                        placeholder="0.00"
                        value={item.unit_price === 0 ? '' : item.unit_price || ''}
                        onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                        onFocus={(e) => {
                          // Select all text for easy editing when focused
                          e.target.select();
                        }}
                        min="0"
                        step="0.01"
                        required
                        className="font-medium"
                      />
                      {item.product_id && (() => {
                        const product = products.find(p => p.id === item.product_id);
                        const defaultPrice = product?.selling_price || 0;
                        if (product && item.unit_price !== defaultPrice) {
                          return (
                            <p className="text-xs text-muted-foreground mt-1">
                              Default: ₹{defaultPrice.toFixed(2)}
                              <Button
                                type="button"
                                variant="link"
                                size="sm"
                                className="h-auto p-0 ml-1 text-xs"
                                onClick={() => updateLineItem(index, 'unit_price', defaultPrice)}
                              >
                                Reset
                              </Button>
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor={`gst-${index}`} className="text-sm mb-1 block">GST %</Label>
                      <Input
                        id={`gst-${index}`}
                        type="number"
                        placeholder="GST %"
                        value={item.gst_rate}
                        onChange={(e) => updateLineItem(index, 'gst_rate', parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>
                    <div className="col-span-1">
                      <Label className="text-sm mb-1 block">Line Total</Label>
                      <p className="text-sm font-medium pt-[9px]">{formatIndianCurrency(item.quantity * item.unit_price)}</p>
                    </div>
                    <div className="col-span-1 flex items-start">
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeLineItem(index)} className="mt-[29px]">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tax on Subtotal Option */}
              <div className="flex items-center space-x-2 p-3 border rounded-md bg-muted/50">
                <input
                  type="checkbox"
                  id="applyTaxOnSubtotal"
                  checked={applyTaxOnSubtotal}
                  onChange={(e) => setApplyTaxOnSubtotal(e.target.checked)}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
                />
                <Label htmlFor="applyTaxOnSubtotal" className="font-normal cursor-pointer text-sm">
                  Apply tax on subtotal (instead of individual items)
                </Label>
                {applyTaxOnSubtotal && (
                  <div className="flex items-center space-x-2 ml-4">
                    <Label htmlFor="subtotalTaxRate" className="text-sm">Tax Rate:</Label>
                    <Input
                      id="subtotalTaxRate"
                      type="number"
                      value={subtotalTaxRate}
                      onChange={(e) => setSubtotalTaxRate(parseFloat(e.target.value) || 0)}
                      className="w-24"
                      placeholder="Tax %"
                      min="0"
                      max="100"
                      step="0.01"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                )}
              </div>

              {/* Discount Fields */}
              <div className="grid grid-cols-2 gap-4 mb-4 border-t pt-4">
                <div>
                  <Label htmlFor="discount-amount">Discount Amount (₹)</Label>
                  <Input
                    id="discount-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.discount_amount}
                    onChange={(e) => {
                      const amount = parseFloat(e.target.value) || 0;
                      setFormData(prev => ({
                        ...prev,
                        discount_amount: amount
                        // Allow both flat and percentage to work independently
                      }));
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="discount-percentage">Discount Percentage (%)</Label>
                  <Input
                    id="discount-percentage"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.discount_percentage}
                    onChange={(e) => {
                      const percentage = parseFloat(e.target.value) || 0;
                      setFormData(prev => ({
                        ...prev,
                        discount_percentage: percentage
                        // Allow both flat and percentage to work independently
                      }));
                    }}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-end space-y-2">
                  <div className="text-right">
                    <p>Value of Goods (Original Price): {formatIndianCurrency(calculateTotals().subtotal)}</p>
                    {calculateTotals().discountAmount > 0 && (
                      <>
                        <p className="text-sm text-green-600">
                          (Less) Discount {formData.discount_percentage > 0 
                            ? `@ ${formData.discount_percentage.toFixed(2)}%`
                            : ''}: ({formatIndianCurrency(calculateTotals().discountAmount)})
                        </p>
                        <p>Transaction Value (Taxable Value): {formatIndianCurrency(calculateTotals().subtotalAfterDiscount)}</p>
                      </>
                    )}
                    {!calculateTotals().discountAmount && (
                      <p>Transaction Value (Taxable Value): {formatIndianCurrency(calculateTotals().subtotal)}</p>
                    )}
                    {applyTaxOnSubtotal && (
                      <>
                        {calculateTotals().cgst > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Add: CGST @ {calculateTotals().subtotalAfterDiscount > 0 
                              ? ((calculateTotals().cgst / calculateTotals().subtotalAfterDiscount) * 100).toFixed(0)
                              : '0'}%: {formatIndianCurrency(calculateTotals().cgst)}
                          </p>
                        )}
                        {calculateTotals().sgst > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Add: SGST @ {calculateTotals().subtotalAfterDiscount > 0 
                              ? ((calculateTotals().sgst / calculateTotals().subtotalAfterDiscount) * 100).toFixed(0)
                              : '0'}%: {formatIndianCurrency(calculateTotals().sgst)}
                          </p>
                        )}
                        {calculateTotals().igst > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Add: IGST: {formatIndianCurrency(calculateTotals().igst)}
                          </p>
                        )}
                      </>
                    )}
                    {!applyTaxOnSubtotal && (
                      <>
                        {calculateTotals().cgst > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Add: CGST @ {calculateTotals().subtotalAfterDiscount > 0 
                              ? ((calculateTotals().cgst / calculateTotals().subtotalAfterDiscount) * 100).toFixed(0)
                              : '0'}%: {formatIndianCurrency(calculateTotals().cgst)}
                          </p>
                        )}
                        {calculateTotals().sgst > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Add: SGST @ {calculateTotals().subtotalAfterDiscount > 0 
                              ? ((calculateTotals().sgst / calculateTotals().subtotalAfterDiscount) * 100).toFixed(0)
                              : '0'}%: {formatIndianCurrency(calculateTotals().sgst)}
                          </p>
                        )}
                        {calculateTotals().igst > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Add: IGST: {formatIndianCurrency(calculateTotals().igst)}
                          </p>
                        )}
                      </>
                    )}
                    <p className="font-bold">Total Invoice Value: {formatIndianCurrency(calculateTotals().total)}</p>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes..."
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pb-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit">Create Invoice</Button>
              </div>
            </form>
            <div className="border-t px-6 py-4 bg-muted/30 flex-shrink-0">
              <p className="text-xs text-muted-foreground text-center">
                Scroll to see all fields. All fields marked with * are required.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by number, entity, type, status..."
          value={invoiceSearch}
          onChange={(e) => setInvoiceSearch(e.target.value)}
          className="flex-1"
        />
        <Button
          variant={hidePaidInvoices ? "default" : "outline"}
          size="sm"
          onClick={() => setHidePaidInvoices(!hidePaidInvoices)}
        >
          {hidePaidInvoices ? "Show Paid" : "Hide Paid"}
        </Button>
      </div>

      <div className="grid gap-4">
        {invoices.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No invoices found. Create your first invoice to get started.</p>
            </CardContent>
          </Card>
        ) : (
          invoices
            .filter((inv) => {
              // Filter out paid invoices if hidePaidInvoices is true
              if (hidePaidInvoices && inv.payment_status === 'paid') {
                return false;
              }
              
              // Search filter
              if (!invoiceSearch.trim()) return true;
              const term = invoiceSearch.toLowerCase();
              return (
                (inv.custom_invoice_number || inv.invoice_number).toLowerCase().includes(term) ||
                (inv.business_entities?.name || inv.suppliers?.company_name || '').toLowerCase().includes(term) ||
                (inv.invoice_type || '').toLowerCase().includes(term) ||
                (inv.payment_status || '').toLowerCase().includes(term)
              );
            })
            .map((invoice) => (
            <Card key={invoice.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2 flex-wrap">
                      <Receipt className="w-5 h-5" />
                      {invoice.custom_invoice_number || invoice.invoice_number}
                      <Badge variant={getPaymentStatusColor(invoice.payment_status)}>
                        {invoice.payment_status}
                      </Badge>
                      <Badge variant="outline">
                        {invoice.invoice_type}
                      </Badge>
                      {invoice.entity_type && (
                        <Badge variant="secondary">
                          {invoice.entity_type}
                        </Badge>
                      )}
                    </CardTitle>
                     <CardDescription>
                       {invoice.business_entities?.name || invoice.suppliers?.company_name || (invoice.entity_type === 'wholesaler' ? 'Wholesaler' : invoice.entity_type || 'Miscellaneous')} • {invoice.invoice_date}
                     </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {invoice.payment_status === 'due' && (
                      <Button 
                        size="sm" 
                        onClick={() => openPaymentDialog(invoice)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Record Payment
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => viewInvoice(invoice)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => downloadInvoice(invoice)}>
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleDelete(invoice.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-xl font-bold">{formatIndianCurrency(invoice.total_amount)}</p>
                  </div>
                  {invoice.total_paid !== undefined && invoice.total_paid > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground">Total Paid</p>
                      <p className="text-xl font-semibold text-green-600">{formatIndianCurrency(invoice.total_paid)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {invoice.amount_due !== undefined && invoice.amount_due <= 0 ? 'Status' : 'Amount Due'}
                    </p>
                    {invoice.amount_due !== undefined && invoice.amount_due > 0 ? (
                      <p className={`text-xl font-bold ${invoice.amount_due > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatIndianCurrency(invoice.amount_due)}
                      </p>
                    ) : invoice.due_date ? (
                      <p className="font-medium text-sm">{invoice.due_date}</p>
                    ) : (
                      <p className="text-xl font-bold text-green-600">Paid</p>
                    )}
                  </div>
                </div>
                
                {invoice.due_date && (!invoice.amount_due || invoice.amount_due > 0) && (
                  <div className="text-sm text-muted-foreground mb-3">
                    Due Date: {invoice.due_date}
                  </div>
                )}
                
                {/* Payment Summary Box - Show when there are payments */}
                {invoice.total_paid !== undefined && invoice.total_paid > 0 && (
                  <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-muted-foreground">Total Paid:</span>
                      <span className="font-semibold text-green-600">{formatIndianCurrency(invoice.total_paid)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-medium">Amount Due:</span>
                      <span className={`text-lg font-bold ${invoice.amount_due && invoice.amount_due > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatIndianCurrency(invoice.amount_due || 0)}
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    {(invoice.amount_due === undefined || invoice.amount_due > 0) && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openPaymentDialog(invoice)}
                      >
                        Record Payment
                      </Button>
                    )}
                    {invoice.payment_status !== 'paid' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => updatePaymentStatus(invoice.id, 'paid')}
                      >
                        Mark as Paid
                      </Button>
                    )}
                  </div>
                  {invoice.notes && (
                    <p className="text-sm text-muted-foreground italic">{invoice.notes}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={viewOpen} onOpenChange={(open) => {
        setViewOpen(open);
        if (!open) {
          setInvoiceGSTBreakdown(null);
        }
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Invoice Details - {selectedInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <p className="text-sm text-muted-foreground">Entity</p>
                   <p className="font-medium">
                     {selectedInvoice.business_entities?.name || 
                      selectedInvoice.suppliers?.company_name || 
                      (selectedInvoice.entity_type === 'wholesaler' ? 'Wholesaler' : selectedInvoice.entity_type || 'Miscellaneous')}
                   </p>
                 </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">{selectedInvoice.invoice_date}</p>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Items</h4>
                <div className="space-y-2">
                  {invoiceItems.map((item) => (
                    <div key={item.id} className="flex justify-between items-center p-2 bg-muted rounded">
                      <div>
                        <p className="font-medium">{item.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.quantity} × {formatIndianCurrency(item.unit_price)} ({item.gst_rate}% GST)
                        </p>
                      </div>
                      <p className="font-medium">{formatIndianCurrency(item.line_total)}</p>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Payment Summary */}
              {selectedInvoice.total_paid !== undefined && selectedInvoice.total_paid > 0 && (
                <div className="border rounded-lg p-4 bg-muted/50">
                  <h4 className="font-medium mb-3">Payment Summary</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Invoice Amount</p>
                      <p className="text-lg font-bold">{formatIndianCurrency(selectedInvoice.total_amount)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Paid</p>
                      <p className="text-lg font-semibold text-green-600">{formatIndianCurrency(selectedInvoice.total_paid)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Amount Due</p>
                      <p className={`text-2xl font-bold ${selectedInvoice.amount_due && selectedInvoice.amount_due > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatIndianCurrency(selectedInvoice.amount_due || selectedInvoice.total_amount)}
                      </p>
                    </div>
                  </div>
                  
                  {invoicePayments.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <h5 className="font-medium text-sm mb-2">Payment History</h5>
                      <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar-dark">
                        {invoicePayments.map((payment) => (
                          <div key={payment.id} className="flex justify-between items-center text-sm">
                            <div>
                              <span className="font-medium">{formatIndianCurrency(payment.amount)}</span>
                              <span className="text-muted-foreground ml-2">
                                • {new Date(payment.payment_date).toLocaleDateString()}
                                {payment.payment_method && ` • ${payment.payment_method}`}
                              </span>
                            </div>
                            {payment.notes && (
                              <span className="text-xs text-muted-foreground">{payment.notes}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="border-t pt-4">
                <div className="space-y-1 text-right">
                  <p>Value of Goods (Original Price): {formatIndianCurrency(selectedInvoice.subtotal)}</p>
                  {selectedInvoice.discount_amount || selectedInvoice.discount_percentage ? (() => {
                    let totalDiscount = selectedInvoice.discount_amount || 0;
                    if (selectedInvoice.discount_percentage && selectedInvoice.discount_percentage > 0) {
                      const remainingAfterFlat = Math.max(0, selectedInvoice.subtotal - totalDiscount);
                      totalDiscount += (remainingAfterFlat * selectedInvoice.discount_percentage) / 100;
                    }
                    const taxableValue = Math.max(0, selectedInvoice.subtotal - totalDiscount);
                    return (
                      <>
                        <p className="text-sm text-green-600">
                          (Less) Discount {selectedInvoice.discount_percentage 
                            ? `@ ${selectedInvoice.discount_percentage.toFixed(2)}%`
                            : ''}: ({formatIndianCurrency(totalDiscount)})
                        </p>
                        <p>Transaction Value (Taxable Value): {formatIndianCurrency(taxableValue)}</p>
                      </>
                    );
                  })() : (
                    <p>Transaction Value (Taxable Value): {formatIndianCurrency(selectedInvoice.subtotal)}</p>
                  )}
                  {invoiceGSTBreakdown && (invoiceGSTBreakdown.cgst > 0 || invoiceGSTBreakdown.sgst > 0 || invoiceGSTBreakdown.igst > 0) ? (
                    <>
                      {invoiceGSTBreakdown.cgst > 0 && (() => {
                        let taxableValue = selectedInvoice.subtotal;
                        if (selectedInvoice.discount_amount || selectedInvoice.discount_percentage) {
                          let totalDiscount = selectedInvoice.discount_amount || 0;
                          if (selectedInvoice.discount_percentage && selectedInvoice.discount_percentage > 0) {
                            const remainingAfterFlat = Math.max(0, selectedInvoice.subtotal - totalDiscount);
                            totalDiscount += (remainingAfterFlat * selectedInvoice.discount_percentage) / 100;
                          }
                          taxableValue = Math.max(0, selectedInvoice.subtotal - totalDiscount);
                        }
                        const cgstRate = taxableValue > 0 ? ((invoiceGSTBreakdown.cgst / taxableValue) * 100).toFixed(0) : '0';
                        return (
                          <p className="text-sm text-muted-foreground">
                            Add: CGST @ {cgstRate}%: {formatIndianCurrency(invoiceGSTBreakdown.cgst)}
                          </p>
                        );
                      })()}
                      {invoiceGSTBreakdown.sgst > 0 && (() => {
                        let taxableValue = selectedInvoice.subtotal;
                        if (selectedInvoice.discount_amount || selectedInvoice.discount_percentage) {
                          let totalDiscount = selectedInvoice.discount_amount || 0;
                          if (selectedInvoice.discount_percentage && selectedInvoice.discount_percentage > 0) {
                            const remainingAfterFlat = Math.max(0, selectedInvoice.subtotal - totalDiscount);
                            totalDiscount += (remainingAfterFlat * selectedInvoice.discount_percentage) / 100;
                          }
                          taxableValue = Math.max(0, selectedInvoice.subtotal - totalDiscount);
                        }
                        const sgstRate = taxableValue > 0 ? ((invoiceGSTBreakdown.sgst / taxableValue) * 100).toFixed(0) : '0';
                        return (
                          <p className="text-sm text-muted-foreground">
                            Add: SGST @ {sgstRate}%: {formatIndianCurrency(invoiceGSTBreakdown.sgst)}
                          </p>
                        );
                      })()}
                      {invoiceGSTBreakdown.igst > 0 && (
                        <p className="text-sm text-muted-foreground">
                          Add: IGST: {formatIndianCurrency(invoiceGSTBreakdown.igst)}
                        </p>
                      )}
                    </>
                  ) : (
                    <p>Add: Tax Amount: {formatIndianCurrency(selectedInvoice.tax_amount)}</p>
                  )}
                  <p className="text-lg font-bold">Total Invoice Value: {formatIndianCurrency(selectedInvoice.total_amount)}</p>
                  {selectedInvoice.amount_due !== undefined && selectedInvoice.amount_due > 0 && (
                    <p className="text-lg font-bold text-red-600 mt-2">
                      Amount Due: {formatIndianCurrency(selectedInvoice.amount_due)}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                {(selectedInvoice.amount_due === undefined || selectedInvoice.amount_due > 0) && (
                  <Button variant="outline" onClick={() => openPaymentDialog(selectedInvoice)}>
                    Record Payment
                  </Button>
                )}
                <Button onClick={() => downloadInvoice(selectedInvoice)}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Product Dialog */}
      <Dialog open={showAddProductDialog} onOpenChange={setShowAddProductDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Product Not Found in Inventory</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              The item "<strong>{pendingProductItem?.description}</strong>" is not in your inventory.
              Would you like to add it?
            </p>
            {pendingProductItem && (
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Price:</span>
                  <span className="text-sm">₹{pendingProductItem.unit_price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">GST Rate:</span>
                  <span className="text-sm">{pendingProductItem.gst_rate}%</span>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              This will create a new product in your inventory with the details from this invoice item.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddProductDialog(false);
                setPendingProductItem(null);
              }}
            >
              Skip
            </Button>
            <Button onClick={createProductFromItem}>
              Add to Inventory
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar-dark">
          <DialogHeader>
            <DialogTitle>Record Payment - {selectedInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-6">
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Invoice Total:</span>
                  <span className="font-bold text-lg">{formatIndianCurrency(selectedInvoice.total_amount)}</span>
                </div>
                {invoicePayments.length > 0 && (
                  <>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-muted-foreground">Total Paid:</span>
                      <span className="font-semibold">{formatIndianCurrency(invoicePayments.reduce((sum, p) => sum + p.amount, 0))}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Balance:</span>
                      <span className={`font-semibold ${selectedInvoice.total_amount - invoicePayments.reduce((sum, p) => sum + p.amount, 0) <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatIndianCurrency(selectedInvoice.total_amount - invoicePayments.reduce((sum, p) => sum + p.amount, 0))}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {invoicePayments.length > 0 && (
                <div>
                  <Label className="mb-2">Payment History</Label>
                  <div className="border rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                    {invoicePayments.map((payment) => (
                      <div key={payment.id} className="flex justify-between items-center text-sm">
                        <div>
                          <span className="font-medium">{formatIndianCurrency(payment.amount)}</span>
                          <span className="text-muted-foreground ml-2">
                            • {new Date(payment.payment_date).toLocaleDateString()}
                            {payment.payment_method && ` • ${payment.payment_method}`}
                          </span>
                        </div>
                        {payment.notes && (
                          <span className="text-xs text-muted-foreground">{payment.notes}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="payment_amount">Payment Amount *</Label>
                  <Input
                    id="payment_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                    placeholder="Enter amount"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="payment_date">Payment Date *</Label>
                  <DateInput
                    id="payment_date"
                    value={paymentData.payment_date}
                    onChange={(value) => setPaymentData(prev => ({ ...prev, payment_date: value }))}
                    placeholder="Select payment date"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="payment_method">Payment Method</Label>
                <Select value={paymentData.payment_method} onValueChange={(value) => setPaymentData(prev => ({ ...prev, payment_method: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="payment_notes">Notes (Optional)</Label>
                <Textarea
                  id="payment_notes"
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes about this payment..."
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={recordPayment}>
                  Record Payment
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};