import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { Plus, ShoppingCart, Download, Edit, Trash2, Eye, Package } from "lucide-react";
import { formatIndianCurrency, calculateGST } from "@/utils/indianBusiness";
import { downloadReportAsCSV } from "@/utils/pdfGenerator";
import { POReceivingManager } from "./POReceivingManager";
import { applyPoReceiptStockUpdates } from "@/services/inventoryPurchaseService";
import { reconcileStockInHandLedger } from "@/services/stockLedgerSyncService";
import { getLedgerMappingSettings } from "@/services/accountingSettingsService";
import { ensureDefaultChartOfAccounts } from "@/services/chartOfAccountsService";
import { POPDF } from "@/components/pdf/POPDF";
import { pdf } from "@react-pdf/renderer";
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
import { logger } from "@/lib/logger";
import { fetchSuppliersForCompany } from "@/lib/supplierScope";

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
  notes: string | null;
  suppliers?: {
    company_name: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
    state?: string;
  };
  items_summary?: {
    total_items: number;
    total_quantity: number;
    items: Array<{
      description: string;
      quantity: number;
      unit_price: number;
      line_total: number;
      received_quantity: number;
      gst_rate?: number;
    }>;
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

interface Supplier {
  id: string;
  company_name: string;
  state?: string;
}

interface Product {
  id: string;
  name: string;
  description?: string | null;
  hsn_code?: string | null;
  purchase_price: number | null;
  gst_rate: number;
  current_stock?: number;
  min_stock_level?: number | null;
  supplier_id?: string | null;
}

export const PurchaseOrderManager = () => {
  const { selectedCompany } = useCompany();
  const { isReadOnly } = useSubscription();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [poSearch, setPoSearch] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [poDetailsLoading, setPoDetailsLoading] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [poItems, setPOItems] = useState<PurchaseOrderItem[]>([]);
  const [receivingItems, setReceivingItems] = useState<{[key: string]: number}>({});
  const [showReceivingModal, setShowReceivingModal] = useState(false);
  const [showNewReceivingManager, setShowNewReceivingManager] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [poToDelete, setPoToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    supplier_id: "",
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: "",
    notes: ""
  });
  const [companyState, setCompanyState] = useState('27'); // Default to Maharashtra
  const [forceIGST, setForceIGST] = useState(false); // Manual IGST selection override
  const [showLowStockOnly, setShowLowStockOnly] = useState(false); // Filter low stock products
  const [newSupplierData, setNewSupplierData] = useState({
    company_name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    gstin: "",
    pan: ""
  });
  const [lineItems, setLineItems] = useState([{
    product_id: "",
    description: "",
    quantity: 1,
    unit_price: 0,
    gst_rate: 18
  }]);
  const { toast } = useToast();

  useEffect(() => {
    // Clear state first to prevent showing stale data
    setSuppliers([]);
    setProducts([]);
    // Then fetch fresh data
    fetchPurchaseOrders();
    fetchSuppliers();
    fetchProducts();
  }, [selectedCompany]);

  const fetchPurchaseOrders = async () => {
    try {
      let query: any = (supabase as any)
        .from('purchase_orders')
        .select(`
          *,
          suppliers (
            company_name,
            address,
            phone,
            email,
            gstin
          ),
          purchase_order_items (
            description,
            quantity,
            unit_price,
            gst_rate,
            line_total,
            received_quantity
          )
        `);

      // Filter by company if a company is selected
      if (selectedCompany?.company_name) {
        query = (query as any).eq('company_id', selectedCompany.company_name);
      }

      const { data, error } = await (query as any).order('created_at', { ascending: false });

      if (error) throw error;
      
      // Process the data to add items summary
      const processedData = (data || []).map((po: any) => {
        const items = po.purchase_order_items || [];
        const items_summary = {
          total_items: items.length,
          total_quantity: items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0),
          items: items.map((item: any) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            gst_rate: item.gst_rate || 18,
            line_total: item.line_total,
            received_quantity: item.received_quantity || 0
          }))
        };
        return {
          ...po,
          items_summary
        };
      });
      
      setPurchaseOrders(processedData);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load purchase orders",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSuppliers([]);
        return;
      }

      const data = await fetchSuppliersForCompany({
        companyName: selectedCompany?.company_name,
        userId: user.id,
      });
      setSuppliers(data);
    } catch (error) {
      logger.error('Failed to load suppliers:', error);
      setSuppliers([]);
    }
  };

  // Fetch company state from profile - use selected company
  useEffect(() => {
    const fetchCompanyState = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !selectedCompany) return;

        const { data: profileData } = await supabase
          .from('profiles')
          .select('business_entities')
          .eq('id', user.id)
          .single();

        if (profileData?.business_entities && Array.isArray(profileData.business_entities)) {
          // Find the selected company's state
          const entities = profileData.business_entities as any[];
          const businessEntity = entities.find(
            (entity: any) => entity.company_name === selectedCompany.company_name
          );
          
          if (businessEntity?.state) {
            setCompanyState(businessEntity.state);
          } else if (selectedCompany.state) {
            // Fallback to selectedCompany state
            setCompanyState(selectedCompany.state);
          }
        }
      } catch (error) {
        logger.error('Failed to fetch company state:', error);
      }
    };

    fetchCompanyState();
  }, [selectedCompany]);

  const fetchProducts = async () => {
    try {
      // Get current user for RLS compliance
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        logger.warn('No user found, cannot fetch products');
        setProducts([]);
        return;
      }

      // Always filter by user_id to ensure we only get products (not suppliers)
      // Explicitly select only from products table with specific fields including supplier_id
      let query: any = (supabase as any)
        .from('products')
        .select('id, name, description, hsn_code, purchase_price, gst_rate, current_stock, min_stock_level, supplier_id')
        .eq('user_id', user.id)
        .not('name', 'is', null); // Ensure name is not null

      // Filter by company if a company is selected
      if (selectedCompany?.company_name) {
        query = query.or(`company_id.eq.${selectedCompany.company_name},company_id.is.null`);
      }

      const { data, error } = await query.order('name');

      if (error) {
        logger.error('Failed to load products:', error);
        throw error;
      }
      
      // Double-check: ensure we only have products (filter out any potential suppliers and test data)
      // Products have: name, current_stock, purchase_price, gst_rate
      // Suppliers have: company_name (NOT name), contact_person, email, phone
      // The key difference: products table has 'name' field, suppliers table has 'company_name' field
      // If a record has 'company_name' field, it's from suppliers table, not products table
      const validProducts = (data || []).filter(p => {
        if (!p || !p.id || !p.name) return false;
        
        // Exclude if it has supplier-specific fields (this means it's from suppliers table, not products)
        if (p.company_name || p.contact_person || p.email || p.phone || p.gstin || p.pan) {
          logger.warn('Filtered out supplier from products (has supplier fields):', p.name || p.company_name);
          return false;
        }
        
        // Exclude generic/test product names like "Product 141", "Product 142", etc.
        const productName = p.name.trim();
        const genericProductPattern = /^product\s+\d+$/i; // Matches "Product 141", "product 142", etc.
        if (genericProductPattern.test(productName)) {
          logger.warn('Filtered out generic/test product:', productName);
          return false;
        }
        
        // Ensure it has product-specific fields (products should have at least one of these)
        return p.name && (p.current_stock !== undefined || p.purchase_price !== undefined || p.gst_rate !== undefined);
      });
      
      console.log('Loaded products:', validProducts.length, 'products (filtered from', data?.length || 0, 'total)');
      if (data && data.length > validProducts.length) {
        logger.warn(`Filtered out ${data.length - validProducts.length} non-product items from products list`);
      }
      setProducts(validProducts);
    } catch (error) {
      logger.error('Failed to load products:', error);
      setProducts([]);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('suppliers')
        .insert([{ ...newSupplierData, user_id: user.id, company_id: selectedCompany?.company_name || null }])
        .select()
        .single();

      if (error) throw error;

      // Refresh suppliers list to ensure it's up to date
      await fetchSuppliers();
      
      // Force a small delay to ensure state propagation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Select the new supplier
      setFormData(prev => ({ ...prev, supplier_id: data.id }));
      
      // Reset form and close dialog
      setNewSupplierData({
        company_name: "",
        contact_person: "",
        email: "",
        phone: "",
        address: "",
        gstin: "",
        pan: ""
      });
      setSupplierDialogOpen(false);
      
      // Ensure suppliers are refreshed after dialog closes
      setTimeout(() => {
        fetchSuppliers();
      }, 200);

      toast({
        title: "Success",
        description: "Supplier created successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create supplier",
        variant: "destructive"
      });
    }
  };

  const generatePONumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const timestamp = now.getTime().toString().slice(-6);
    return `PO-${year}${month}-${timestamp}`;
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    lineItems.forEach(item => {
      const lineTotal = item.quantity * item.unit_price;
      subtotal += lineTotal;
      
      // Calculate GST based on forceIGST flag or state difference
      const supplierState = formData.supplier_id ? 
        (suppliers.find(s => s.id === formData.supplier_id)?.state || '27') : '27';
      const isInterState = forceIGST || (supplierState !== companyState && supplierState && companyState);
      
      const gstAmount = (lineTotal * item.gst_rate) / 100;
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

    return {
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
      cgst,
      sgst,
      igst
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate all line items have descriptions
    const itemsWithoutDescription = lineItems.filter(item => !item.description || item.description.trim() === '');
    if (itemsWithoutDescription.length > 0) {
      toast({
        title: "Validation Error",
        description: `Please enter description for all items. ${itemsWithoutDescription.length} item(s) missing description.`,
        variant: "destructive"
      });
      return;
    }
    
    try {
      const totals = calculateTotals();
      const poNumber = generatePONumber();

      // Create purchase order
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert([{
          po_number: poNumber,
          supplier_id: formData.supplier_id || null,
          company_id: selectedCompany?.company_name || null,
          order_date: formData.order_date,
          expected_delivery_date: formData.expected_delivery_date || null,
          subtotal: totals.subtotal,
          tax_amount: totals.taxAmount,
          total_amount: totals.total,
          notes: formData.notes || null,
          user_id: user.id
        }])
        .select()
        .single();

      if (poError) {
        logger.error('PO creation error:', poError);
        throw poError;
      }

      // Create purchase order items
      const itemsToInsert = lineItems.map(item => ({
        purchase_order_id: po.id,
        product_id: item.product_id || null,
        description: item.description.trim(), // Ensure description is trimmed
        quantity: item.quantity,
        unit_price: item.unit_price,
        gst_rate: item.gst_rate,
        line_total: item.quantity * item.unit_price
      }));

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(itemsToInsert);

      if (itemsError) {
        logger.error('PO items creation error:', itemsError);
        throw itemsError;
      }

      // Do not change inventory on PO creation; update happens on receiving

      // Show success message immediately
      toast({ title: "Success", description: "Purchase order created successfully" });
      resetForm();
      fetchPurchaseOrders();

      // No attachments to upload
    } catch (error: any) {
      logger.error('Purchase order creation error:', error);
      const errorMessage = error?.message || error?.details || 'Failed to create purchase order';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id: string) => {
    setPoToDelete(id);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!poToDelete) return;
    
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', poToDelete);

      if (error) throw error;
      toast({ title: "Success", description: "Purchase order deleted successfully" });
      fetchPurchaseOrders();
      setShowDeleteDialog(false);
      setPoToDelete(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete purchase order",
        variant: "destructive"
      });
    }
  };

  const viewPurchaseOrder = async (po: PurchaseOrder) => {
    // Open immediately and show loader; then fetch items
    setSelectedPO(po);
    setPoDetailsLoading(true);
    setViewOpen(true);
    try {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('purchase_order_id', po.id);

      if (error) throw error;
      setPOItems(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load purchase order details",
        variant: "destructive"
      });
    } finally {
      setPoDetailsLoading(false);
    }
  };

  const downloadPurchaseOrder = async (po: PurchaseOrder) => {
    try {
      // Fetch PO items for this specific PO
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('purchase_order_id', po.id);

      if (error) throw error;
      const items = data || [];

      // Fetch full supplier details if not available
      let supplierDetails = po.suppliers;
      if (po.supplier_id && (!supplierDetails || !supplierDetails.address)) {
        const { data: supplierData, error: supplierError } = await supabase
          .from('suppliers')
          .select('company_name, address, phone, email, gstin')
          .eq('id', po.supplier_id)
          .single();

        if (!supplierError && supplierData) {
          supplierDetails = supplierData;
        }
      }
      
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
        <POPDF 
          purchaseOrder={{
            ...po,
            suppliers: supplierDetails
          }}
          items={items.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            gst_rate: item.gst_rate,
            line_total: item.line_total
          }))}
          companyInfo={{
            name: companyInfo.company_name || "Your Company Name",
            address: companyInfo.address || "Your Company Address",
            phone: companyInfo.phone || companyInfo.owner_phone || "Your Phone",
            email: companyInfo.email || user?.email || "your@email.com",
            gstin: companyInfo.gst || companyInfo.gstin || "Your GSTIN"
          }}
        />
      );
      
      const blob = await pdf(pdfDoc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `purchase-order-${po.po_number}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Purchase order downloaded as PDF"
      });
    } catch (error) {
      logger.error('Error downloading purchase order:', error);
      toast({
        title: "Error",
        description: "Failed to download purchase order",
        variant: "destructive"
      });
    }
  };

  const openReceivingModal = (po: PurchaseOrder) => {
    setSelectedPO(po);
    setShowNewReceivingManager(true);
  };

  const updateReceivedQuantities = async () => {
    if (!selectedPO) return;

    try {
      const itemsToReceive = poItems.filter(
        (item) => (receivingItems[item.id] || 0) > 0
      );

      if (itemsToReceive.length === 0) {
        toast({
          title: "No Changes",
          description: "Enter a quantity to receive before saving",
          variant: "destructive",
        });
        return;
      }

      for (const item of itemsToReceive) {
        const receiveQty = receivingItems[item.id] || 0;
        const newReceivedQuantity = (item.received_quantity || 0) + receiveQty;

        const { error: itemError } = await supabase
          .from('purchase_order_items')
          .update({ received_quantity: newReceivedQuantity })
          .eq('id', item.id);

        if (itemError) throw itemError;
      }

      const stockResult = await applyPoReceiptStockUpdates({
        companyId: selectedCompany?.company_name,
        items: itemsToReceive.map((item) => ({
          product_id: item.product_id,
          receiveQty: receivingItems[item.id] || 0,
          description: item.description,
        })),
      });

      if (stockResult.failed > 0) {
        stockResult.messages.forEach((message) => logger.warn('PO receipt stock:', message));
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && selectedCompany?.company_name && stockResult.updated > 0) {
          let stockMapping = await getLedgerMappingSettings(user.id, selectedCompany.company_name);
          stockMapping = await ensureDefaultChartOfAccounts(
            user.id,
            selectedCompany.company_name,
            stockMapping
          );
          await reconcileStockInHandLedger({
            companyId: selectedCompany.company_name,
            userId: user.id,
            mapping: stockMapping,
            asOfDate: new Date().toISOString().split('T')[0],
            reference: selectedPO.po_number,
          });
        }
      } catch (stockLedgerError) {
        logger.error('Stock-in-Hand sync after PO receipt failed (non-blocking):', stockLedgerError);
      }

      const updatedItems = poItems.map((item) => ({
        ...item,
        received_quantity: (item.received_quantity || 0) + (receivingItems[item.id] || 0),
      }));

      const allFullyReceived = updatedItems.every(
        (item) => (item.received_quantity || 0) >= item.quantity
      );
      const hasPartialReceipt = updatedItems.some(
        (item) =>
          (item.received_quantity || 0) > 0 &&
          (item.received_quantity || 0) < item.quantity
      );

      let newStatus = selectedPO.status;
      if (allFullyReceived) {
        newStatus = 'received';
      } else if (hasPartialReceipt) {
        newStatus = 'partial';
      }

      await supabase
        .from('purchase_orders')
        .update({ status: newStatus })
        .eq('id', selectedPO.id);

      toast({
        title: "Success",
        description: stockResult.updated > 0
          ? allFullyReceived
            ? `Purchase order fully received. Stock updated for ${stockResult.updated} product(s).`
            : `Partial receipt recorded. Stock updated for ${stockResult.updated} product(s).`
          : allFullyReceived
            ? "Purchase order fully received."
            : "Partial receipt recorded.",
      });

      fetchPurchaseOrders();
      setShowReceivingModal(false);
      setViewOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update received quantities",
        variant: "destructive"
      });
    }
  };

  // Removed attachment upload logic

  const resetForm = () => {
    setFormData({
      supplier_id: "",
      order_date: new Date().toISOString().split('T')[0],
      expected_delivery_date: "",
      notes: ""
    });
    setShowLowStockOnly(false);
    setLineItems([{
      product_id: "",
      description: "",
      quantity: 1,
      unit_price: 0,
      gst_rate: 18
    }]);
    setForceIGST(false);
    setOpen(false);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, {
      product_id: "",
      description: "",
      quantity: 1,
      unit_price: 0,
      gst_rate: 18
    }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    const currentItem = { ...updated[index] }; // Copy current item before updating
    const previousProductId = currentItem.product_id;
    const previousDescription = currentItem.description;
    
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto-fill product details when product is selected
    if (field === 'product_id') {
      if (value && value !== "__manual__") {
        const product = products.find(p => p.id === value);
        if (product) {
          // Auto-fill description if it's empty or if it matches the previous product name
          const previousProduct = previousProductId ? products.find(p => p.id === previousProductId) : null;
          const wasAutoFilledFromPrevious = previousProduct && previousDescription === previousProduct.name;
          
          if (!previousDescription || wasAutoFilledFromPrevious) {
            updated[index].description = product.name;
          }
          updated[index].unit_price = product.purchase_price || 0;
          updated[index].gst_rate = product.gst_rate;
        }
      } else {
        // When "Manual Entry" is selected (empty value), clear description only if it was auto-filled
        const wasAutoFilled = previousProductId && products.some(p => 
          p.id === previousProductId && p.name === previousDescription
        );
        if (wasAutoFilled) {
          updated[index].description = '';
        }
      }
    }
    
    setLineItems(updated);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'received': return 'default';
      case 'sent': return 'secondary';
      case 'partial': return 'outline';
      case 'draft': return 'outline';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  const downloadPOReport = () => {
    const reportData = purchaseOrders.map(po => ({
      po_number: po.po_number,
      order_date: po.order_date,
      supplier_name: po.suppliers?.company_name || 'N/A',
      status: po.status,
      total_amount: po.total_amount
    }));
    
    downloadReportAsCSV(
      'Purchase Orders Report',
      reportData,
      ['po_number', 'order_date', 'supplier_name', 'status', 'total_amount']
    );
    
    toast({ title: "Success", description: "Purchase Orders report downloaded successfully" });
  };

  if (loading) {
    return <div className="text-center py-8">Loading purchase orders...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Purchase Orders</h2>
          <p className="text-muted-foreground">Create and manage purchase orders for inventory restocking</p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadPOReport}>
            <Download className="w-4 h-4 mr-2" />
            Download Report
          </Button>
          
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()} disabled={isReadOnly}>
              <Plus className="w-4 h-4 mr-2" />
              Create Purchase Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto modal-scrollbar smooth-scroll">
            <DialogHeader>
              <DialogTitle>Create New Purchase Order</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="supplier_id">Supplier</Label>
                  <div className="flex gap-2">
                    <Select 
                      key={suppliers.length} // Force re-render when suppliers list changes
                      value={formData.supplier_id} 
                      onValueChange={(value) => {
                        if (value === "add_new") {
                          setSupplierDialogOpen(true);
                          // Refresh suppliers when opening dialog to ensure latest list
                          fetchSuppliers();
                        } else {
                          setFormData(prev => ({ ...prev, supplier_id: value }));
                        }
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border z-50">
                        {suppliers.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            No suppliers found. Add a new supplier below.
                          </div>
                        ) : (
                          suppliers
                            .filter(s => s && s.id && s.company_name && !(s as any).name) // Extra safety: ensure it's a supplier, not a product
                            .map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.id}>
                                {supplier.company_name}
                              </SelectItem>
                            ))
                        )}
                        <SelectItem value="add_new" className="text-primary font-medium">
                          <div className="flex items-center gap-2">
                            <Plus className="w-4 h-4" />
                            Add New Supplier
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="order_date">Order Date</Label>
                  <DateInput
                    id="order_date"
                    value={formData.order_date}
                    onChange={(value) => setFormData(prev => ({ ...prev, order_date: value }))}
                    placeholder="Select order date"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="expected_delivery_date">Expected Delivery</Label>
                  <DateInput
                    id="expected_delivery_date"
                    value={formData.expected_delivery_date}
                    onChange={(value) => setFormData(prev => ({ ...prev, expected_delivery_date: value }))}
                    placeholder="Select delivery date"
                  />
                </div>
              </div>

              {/* Options */}
              <div className="space-y-2">
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
                <div className="flex items-center space-x-2 p-3 border rounded-md bg-muted/50">
                  <input
                    type="checkbox"
                    id="showLowStockOnly"
                    checked={showLowStockOnly}
                    onChange={(e) => setShowLowStockOnly(e.target.checked)}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
                  />
                  <Label htmlFor="showLowStockOnly" className="font-normal cursor-pointer text-sm">
                    Show only low stock products
                  </Label>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-4">
                  <Label>Order Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </Button>
                </div>
                
                {lineItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-start mb-4 p-3 border rounded-lg">
                    <div className="col-span-3">
                      <Label htmlFor={`product-${index}`} className="text-sm mb-1 block">Product</Label>
                      <Select value={item.product_id || "__manual__"} onValueChange={(value) => updateLineItem(index, 'product_id', value === "__manual__" ? "" : value)}>
                        <SelectTrigger id={`product-${index}`}>
                          <SelectValue placeholder="Select product (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__manual__">Manual Entry</SelectItem>
                          {products.length === 0 ? (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              No products found
                            </div>
                          ) : (
                            products
                              .filter(p => {
                                // Strict filtering: ensure it's a product, not a supplier
                                if (!p || !p.id || !p.name) return false;
                                // Exclude if it has supplier-specific fields (this means it's from suppliers table)
                                if ((p as any).company_name || (p as any).contact_person || (p as any).email || (p as any).phone) return false;
                                // Exclude generic/test product names like "Product 141", "Product 142", etc.
                                const productName = p.name.trim();
                                const genericProductPattern = /^product\s+\d+$/i;
                                if (genericProductPattern.test(productName)) return false;
                                
                                // Filter by selected supplier - only show products linked to the selected supplier
                                // If a supplier is selected, only show products that are linked to that supplier
                                // If no supplier is selected, show all products (including those without supplier_id)
                                if (formData.supplier_id) {
                                  // Only show products that match the selected supplier
                                  // Products without supplier_id are excluded when a supplier is selected
                                  if (p.supplier_id !== formData.supplier_id) return false;
                                }
                                
                                // Filter by low stock if checkbox is checked
                                if (showLowStockOnly) {
                                  // Only show products that have min_stock_level set AND current_stock <= min_stock_level
                                  if (p.min_stock_level == null || p.min_stock_level === undefined) {
                                    return false; // Exclude products without min_stock_level set
                                  }
                                  const currentStock = p.current_stock ?? 0;
                                  const minStock = p.min_stock_level;
                                  if (currentStock > minStock) return false; // Only show if stock is at or below min level
                                }
                                
                                // Ensure it has product-specific fields
                                return p.name && (p.current_stock !== undefined || p.purchase_price !== undefined);
                              })
                              .map((product) => (
                                <SelectItem key={product.id} value={product.id}>
                                  {product.name} {(product.current_stock !== undefined) ? ` (Stock: ${product.current_stock})` : ''}
                                </SelectItem>
                              ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Label htmlFor={`description-${index}`} className="text-sm mb-1 block">
                        Description <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`description-${index}`}
                        placeholder="Enter item description"
                        value={item.description}
                        onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                        required
                        className={!item.description ? "border-destructive" : ""}
                      />
                      {!item.description && (
                        <p className="text-xs text-destructive mt-1">Description is required</p>
                      )}
                      {item.product_id && item.description === products.find(p => p.id === item.product_id)?.name && (
                        <p className="text-xs text-muted-foreground mt-1">Auto-filled from product. You can edit if needed.</p>
                      )}
                    </div>
                    <div className="col-span-1">
                      <Label htmlFor={`quantity-${index}`} className="text-sm mb-1 block">Qty</Label>
                      <Input
                        id={`quantity-${index}`}
                        type="number"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Only allow whole numbers
                          if (value === '' || /^\d+$/.test(value)) {
                            updateLineItem(index, 'quantity', value === '' ? 0 : parseInt(value, 10));
                          }
                        }}
                        onKeyDown={(e) => {
                          // Prevent decimal point, minus, and 'e' key
                          if (e.key === '.' || e.key === '-' || e.key === 'e' || e.key === 'E') {
                            e.preventDefault();
                          }
                          // Handle arrow keys - allow but prevent decimal input
                          if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
                            e.preventDefault();
                            const currentValue = parseInt(String(item.quantity), 10) || 0;
                            const newValue = e.key === 'ArrowUp' ? currentValue + 1 : Math.max(0, currentValue - 1);
                            updateLineItem(index, 'quantity', newValue);
                          }
                        }}
                        min="0"
                        step="1"
                        required
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor={`price-${index}`} className="text-sm mb-1 block">Unit Price</Label>
                      <Input
                        id={`price-${index}`}
                        type="number"
                        placeholder="Price"
                        value={item.unit_price}
                        onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>
                    <div className="col-span-1">
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
                      {lineItems.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeLineItem(index)} className="mt-[29px]">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-end space-y-2">
                  <div className="text-right">
                    <p>Subtotal: {formatIndianCurrency(calculateTotals().subtotal)}</p>
                    <p>Tax: {formatIndianCurrency(calculateTotals().taxAmount)}</p>
                    <p className="font-bold">Total: {formatIndianCurrency(calculateTotals().total)}</p>
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

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit">Create Purchase Order</Button>
              </div>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by PO number, supplier, status..."
          value={poSearch}
          onChange={(e) => setPoSearch(e.target.value)}
        />
      </div>

      <div className="grid gap-4">
        {purchaseOrders.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No purchase orders found. Create your first purchase order to get started.</p>
            </CardContent>
          </Card>
        ) : (
          purchaseOrders
            .filter((po) => {
              if (!poSearch.trim()) return true;
              const term = poSearch.toLowerCase();
              return (
                po.po_number.toLowerCase().includes(term) ||
                (po.suppliers?.company_name || '').toLowerCase().includes(term) ||
                (po.status || '').toLowerCase().includes(term)
              );
            })
            .map((po) => (
            <Card key={po.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingCart className="w-5 h-5" />
                      {po.po_number}
                      <Badge variant={getStatusColor(po.status)}>
                        {po.status}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      {po.suppliers?.company_name || 'No supplier'} • {po.order_date}
                      {po.expected_delivery_date && ` • Expected: ${po.expected_delivery_date}`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => viewPurchaseOrder(po)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => downloadPurchaseOrder(po)}>
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleDelete(po.id)}
                      className="text-destructive hover:text-destructive"
                      disabled={isReadOnly}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Amount</p>
                      <p className="text-2xl font-bold">{formatIndianCurrency(po.total_amount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Status</p>
                      <p className="font-medium capitalize">{po.status}</p>
                    </div>
                  </div>
                  
                  {po.items_summary && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                      <div>
                        <p className="text-sm text-muted-foreground">Items</p>
                        <p className="font-semibold text-lg">{po.items_summary.total_items}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Quantity</p>
                        <p className="font-semibold text-lg">{po.items_summary.total_quantity.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Subtotal</p>
                        <p className="font-semibold">{formatIndianCurrency(po.subtotal)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Tax</p>
                        <p className="font-semibold">{formatIndianCurrency(po.tax_amount)}</p>
                      </div>
                    </div>
                  )}
                  
                  {po.items_summary && po.items_summary.items.length > 0 && (
                    <div className="pt-4 border-t">
                      <p className="text-sm font-medium mb-2 text-muted-foreground">Items Preview</p>
                      <div className="space-y-2">
                        {po.items_summary.items.slice(0, 3).map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center text-sm">
                            <div className="flex-1 truncate">
                              <span className="font-medium">{item.description}</span>
                            </div>
                            <div className="flex items-center gap-4 ml-4">
                              <span className="text-muted-foreground">Qty: <span className="font-medium">{item.quantity}</span></span>
                              <span className="text-muted-foreground">@ <span className="font-medium">{formatIndianCurrency(item.unit_price)}</span></span>
                              <span className="text-muted-foreground">GST: <span className="font-medium">{item.gst_rate}%</span></span>
                              <span className="font-semibold">{formatIndianCurrency(item.line_total)}</span>
                            </div>
                          </div>
                        ))}
                        {po.items_summary.items.length > 3 && (
                          <p className="text-xs text-muted-foreground italic">
                            +{po.items_summary.items.length - 3} more item{po.items_summary.items.length - 3 !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={viewOpen && !!selectedPO} onOpenChange={(open) => {
        setViewOpen(open);
        if (!open) {
          setSelectedPO(null);
          setPOItems([]);
          setPoDetailsLoading(false);
        }
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Purchase Order Details - {selectedPO?.po_number}</DialogTitle>
          </DialogHeader>
          {selectedPO && (
            <div className="space-y-4">
              {poDetailsLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading purchase order details...</div>
              ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Supplier</p>
                  <p className="font-medium">{selectedPO.suppliers?.company_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Order Date</p>
                  <p className="font-medium">{selectedPO.order_date}</p>
                </div>
              </div>
              )}
              
               <div>
                 <h4 className="font-medium mb-2">Items</h4>
                 <div className="space-y-2">
                  {poDetailsLoading ? (
                    <div className="p-3 bg-muted rounded border text-sm text-muted-foreground">Loading items...</div>
                  ) : poItems.map((item) => (
                     <div key={item.id} className="flex justify-between items-center p-3 bg-muted rounded border">
                       <div className="flex-1">
                         <p className="font-medium">{item.description}</p>
                         <p className="text-sm text-muted-foreground">
                           {formatIndianCurrency(item.unit_price)} per unit ({item.gst_rate}% GST)
                         </p>
                       </div>
                       <div className="text-center mx-4">
                         <p className="text-sm text-muted-foreground">Ordered</p>
                         <p className="font-medium">{item.quantity}</p>
                       </div>
                       <div className="text-center mx-4">
                         <p className="text-sm text-muted-foreground">Received</p>
                         <div className="flex items-center gap-2">
                           <p className="font-medium">{item.received_quantity || 0}</p>
                           <Badge variant={
                             (item.received_quantity || 0) >= item.quantity ? 'default' : 
                             (item.received_quantity || 0) > 0 ? 'secondary' : 'outline'
                           }>
                             {((item.received_quantity || 0) / item.quantity * 100).toFixed(0)}%
                           </Badge>
                         </div>
                       </div>
                       <div className="text-right">
                         <p className="text-sm text-muted-foreground">Line Total</p>
                         <p className="font-medium">{formatIndianCurrency(item.line_total)}</p>
                       </div>
                     </div>
                  ))}
                 </div>
               </div>
              
              <div className="border-t pt-4">
                <div className="space-y-1 text-right">
                  <p>Subtotal: {formatIndianCurrency(selectedPO.subtotal)}</p>
                  <p>Tax: {formatIndianCurrency(selectedPO.tax_amount)}</p>
                  <p className="text-lg font-bold">Total: {formatIndianCurrency(selectedPO.total_amount)}</p>
                </div>
              </div>
              
              {/* Attachments removed */}

              <div className="flex justify-end gap-2">
                {selectedPO.status !== 'received' && (
                  <Button 
                    onClick={() => openReceivingModal(selectedPO)} 
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={isReadOnly}
                  >
                    <Package className="w-4 h-4 mr-2" />
                    Update Receipt
                  </Button>
                )}
                <Button variant="outline" onClick={() => downloadPurchaseOrder(selectedPO)}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* New Supplier Dialog */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Supplier</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSupplier} className="space-y-4">
            <div>
              <Label htmlFor="company_name">Company Name *</Label>
              <Input
                id="company_name"
                value={newSupplierData.company_name}
                onChange={(e) => setNewSupplierData(prev => ({ ...prev, company_name: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input
                id="contact_person"
                value={newSupplierData.contact_person}
                onChange={(e) => setNewSupplierData(prev => ({ ...prev, contact_person: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newSupplierData.email}
                onChange={(e) => setNewSupplierData(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={newSupplierData.phone}
                onChange={(e) => setNewSupplierData(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={newSupplierData.address}
                onChange={(e) => setNewSupplierData(prev => ({ ...prev, address: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="gstin">GSTIN</Label>
                <Input
                  id="gstin"
                  value={newSupplierData.gstin}
                  onChange={(e) => setNewSupplierData(prev => ({ ...prev, gstin: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="pan">PAN</Label>
                <Input
                  id="pan"
                  value={newSupplierData.pan}
                  onChange={(e) => setNewSupplierData(prev => ({ ...prev, pan: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSupplierDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Add Supplier
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Receiving Modal */}
      <Dialog open={showReceivingModal} onOpenChange={setShowReceivingModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto custom-scrollbar-dark smooth-scroll">
          <DialogHeader>
            <DialogTitle>Update Received Quantities - {selectedPO?.po_number}</DialogTitle>
          </DialogHeader>
          {selectedPO && (
            <div className="space-y-6">
              <div className="space-y-4">
                {poItems.map((item) => (
                  <div key={item.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{item.description}</h4>
                        <p className="text-sm text-muted-foreground">
                          Ordered: {item.quantity} | Previously Received: {item.received_quantity || 0}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`received-${item.id}`} className="text-sm">
                          Received Qty:
                        </Label>
                        <Input
                          id={`received-${item.id}`}
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={receivingItems[item.id] || 0}
                          onChange={(e) => setReceivingItems(prev => ({
                            ...prev,
                            [item.id]: Math.min(item.quantity, Math.max(0, parseInt(e.target.value) || 0))
                          }))}
                          className="w-24"
                        />
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${Math.min(100, ((receivingItems[item.id] || 0) / item.quantity) * 100)}%` 
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {((receivingItems[item.id] || 0) / item.quantity * 100).toFixed(1)}% received
                    </p>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowReceivingModal(false)}
                >
                  Cancel
                </Button>
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={updateReceivedQuantities}>
                  Update Receipt
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Enhanced PO Receiving Manager */}
      {showNewReceivingManager && selectedPO && (
        <POReceivingManager
          po={selectedPO}
          onClose={() => {
            setShowNewReceivingManager(false);
            setSelectedPO(null);
          }}
          onInventoryUpdated={() => {
            fetchPurchaseOrders();
            toast({
              title: "Success",
              description: "Inventory updated successfully"
            });
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this purchase order? This action cannot be undone.
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