import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Plus, Edit, Trash2, Package, Download, Upload } from "lucide-react";
import { downloadReportAsCSV } from "@/utils/pdfGenerator";
import { formatIndianCurrency } from "@/utils/indianBusiness";
import { ERPImportManager } from "@/components/import/ERPImportManager";
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

interface Product {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  hsn_code: string | null;
  unit: string;
  purchase_price: number | null;
  selling_price: number | null;
  gst_rate: number;
  current_stock: number;
  min_stock_level: number;
  max_stock_level: number | null;
  opening_stock_qty?: number | null;
  opening_stock_value?: number | null;
}

interface Supplier {
  id: string;
  company_name: string;
}

export const ProductsManager = () => {
  const { selectedCompany } = useCompany();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [productUsageInfo, setProductUsageInfo] = useState<{invoiceCount: number, poCount: number} | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    sku: "",
    hsn_code: "",
    unit: "Nos",
    purchase_price: "",
    selling_price: "",
    gst_rate: "18",
    current_stock: "0",
    min_stock_level: "0",
    max_stock_level: "",
    supplier_id: "",
    opening_stock_qty: "",
    opening_stock_value: ""
  });
  const [newSupplierData, setNewSupplierData] = useState({
    company_name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    gstin: "",
    pan: ""
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
  }, [selectedCompany]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('products')
        .select('*');

      // Filter by company if a company is selected
      if (selectedCompany?.company_name) {
        query = query.eq('company_id', selectedCompany.company_name);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load products",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      let query = supabase
        .from('suppliers')
        .select('id, company_name');

      // Filter by company if a company is selected
      if (selectedCompany?.company_name) {
        query = query.eq('company_id', selectedCompany.company_name);
      }

      const { data, error } = await query.order('company_name');

      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      logger.error('Failed to load suppliers:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Get current user for RLS compliance
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const productData = {
        name: formData.name,
        description: formData.description || null,
        sku: formData.sku || null,
        hsn_code: formData.hsn_code || null,
        unit: formData.unit,
        purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
        selling_price: formData.selling_price ? parseFloat(formData.selling_price) : null,
        gst_rate: parseFloat(formData.gst_rate),
        current_stock: parseInt(formData.current_stock),
        min_stock_level: parseInt(formData.min_stock_level),
        max_stock_level: formData.max_stock_level ? parseInt(formData.max_stock_level) : null,
        supplier_id: formData.supplier_id || null,
        // Opening stock is used only for reporting (P&L opening stock),
        // and should not be confused with current live stock.
        opening_stock_qty: formData.opening_stock_qty
          ? parseFloat(formData.opening_stock_qty)
          : null,
        opening_stock_value: formData.opening_stock_value
          ? parseFloat(formData.opening_stock_value)
          : null,
        user_id: user.id,
        company_id: selectedCompany?.company_name || null
      };

      if (editingProduct) {
        // For editing, check if the new name conflicts with another product (excluding current product)
        const productNameLower = productData.name.trim().toLowerCase();
        const { data: existingProducts } = await supabase
          .from('products')
          .select('id, name, sku')
          .eq('company_id', selectedCompany?.company_name || '')
          .eq('user_id', user.id)
          .neq('id', editingProduct.id);

        const nameConflict = existingProducts?.some(p => 
          p.name.trim().toLowerCase() === productNameLower
        );
        
        if (nameConflict) {
          toast({
            title: "Duplicate Product",
            description: `A product with the name "${productData.name}" already exists in this company. Please use a different name.`,
            variant: "destructive"
          });
          return;
        }

        // Check SKU conflict if SKU is provided
        if (productData.sku) {
          const skuConflict = existingProducts?.some(p => 
            p.sku && p.sku.trim().toLowerCase() === productData.sku!.trim().toLowerCase()
          );
          
          if (skuConflict) {
            toast({
              title: "Duplicate SKU",
              description: `A product with SKU "${productData.sku}" already exists in this company. Please use a different SKU.`,
              variant: "destructive"
            });
            return;
          }
        }

        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) throw error;
        toast({ title: "Success", description: "Product updated successfully" });
      } else {
        // For new products, check for duplicates
        const productNameLower = productData.name.trim().toLowerCase();
        let duplicateCheck = supabase
          .from('products')
          .select('id, name, sku')
          .eq('company_id', selectedCompany?.company_name || '')
          .eq('user_id', user.id)
          .ilike('name', productData.name);

        if (productData.sku) {
          duplicateCheck = duplicateCheck.or(`sku.ilike."${productData.sku}"`);
        }

        const { data: existingProducts, error: checkError } = await duplicateCheck;

        if (checkError) {
          logger.error('Error checking duplicates:', checkError);
        }

        const nameDuplicate = existingProducts?.some(p => 
          p.name.trim().toLowerCase() === productNameLower
        );
        
        if (nameDuplicate) {
          toast({
            title: "Duplicate Product",
            description: `A product with the name "${productData.name}" already exists in this company. Please use a different name or edit the existing product.`,
            variant: "destructive"
          });
          return;
        }

        if (productData.sku) {
          const skuDuplicate = existingProducts?.some(p => 
            p.sku && p.sku.trim().toLowerCase() === productData.sku!.trim().toLowerCase()
          );
          
          if (skuDuplicate) {
            toast({
              title: "Duplicate SKU",
              description: `A product with SKU "${productData.sku}" already exists in this company. Please use a different SKU.`,
              variant: "destructive"
            });
            return;
          }
        }

        const { error } = await supabase
          .from('products')
          .insert([productData]);

        if (error) throw error;
        toast({ title: "Success", description: "Product added successfully" });
      }

      resetForm();
      fetchProducts();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save product",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id: string) => {
    setProductToDelete(id);
    
    // Check usage before showing dialog
    try {
      const { count: invoiceCount } = await supabase
        .from('invoice_items')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', id);

      const { count: poCount } = await supabase
        .from('purchase_order_items')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', id);

      setProductUsageInfo({
        invoiceCount: invoiceCount || 0,
        poCount: poCount || 0
      });
    } catch (error) {
      logger.error('Error checking product usage:', error);
      setProductUsageInfo({ invoiceCount: 0, poCount: 0 });
    }
    
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;
    
    try {
      // If product is used, first set product_id to NULL in related records
      // This handles cases where ON DELETE SET NULL might not be working
      if (productUsageInfo && (productUsageInfo.invoiceCount > 0 || productUsageInfo.poCount > 0)) {
        // Set product_id to NULL in invoice_items
        if (productUsageInfo.invoiceCount > 0) {
          const { error: invoiceError } = await supabase
            .from('invoice_items')
            .update({ product_id: null })
            .eq('product_id', productToDelete);
          
          if (invoiceError) {
            logger.warn('Failed to update invoice_items:', invoiceError);
            // Continue anyway - database constraint might handle it
          }
        }
        
        // Set product_id to NULL in purchase_order_items
        if (productUsageInfo.poCount > 0) {
          const { error: poError } = await supabase
            .from('purchase_order_items')
            .update({ product_id: null })
            .eq('product_id', productToDelete);
          
          if (poError) {
            logger.warn('Failed to update purchase_order_items:', poError);
            // Continue anyway - database constraint might handle it
          }
        }
      }

      // Now attempt deletion
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productToDelete);

      if (error) {
        // Handle specific error codes
        if (error.code === '23503') {
          // Foreign key constraint violation
          throw new Error("Cannot delete product due to database constraints. The product may be referenced in a way that prevents deletion. Please contact support.");
        } else if (error.code === '42501') {
          throw new Error("Permission denied. You don't have permission to delete this product.");
        }
        throw error;
      }

      toast({ title: "Success", description: "Product deleted successfully" });
      fetchProducts();
      setShowDeleteDialog(false);
      setProductToDelete(null);
      setProductUsageInfo(null);
    } catch (error: any) {
      logger.error('Delete product error:', error);
      let errorMessage = "Failed to delete product";
      
      if (error.code === '23503' || error.message?.includes('23503')) {
        errorMessage = "Cannot delete product due to database constraints. The product may be referenced in invoices or purchase orders in a way that prevents deletion. Please contact support if this issue persists.";
      } else if (error.code === '42501') {
        errorMessage = "Permission denied. You don't have permission to delete this product.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      sku: "",
      hsn_code: "",
      unit: "Nos",
      purchase_price: "",
      selling_price: "",
      gst_rate: "18",
      current_stock: "0",
      min_stock_level: "0",
      max_stock_level: "",
      supplier_id: "",
      opening_stock_qty: "",
      opening_stock_value: ""
    });
    setEditingProduct(null);
    setOpen(false);
  };

  const startEdit = (product: Product) => {
    setFormData({
      name: product.name,
      description: product.description || "",
      sku: product.sku || "",
      hsn_code: product.hsn_code || "",
      unit: product.unit,
      purchase_price: product.purchase_price?.toString() || "",
      selling_price: product.selling_price?.toString() || "",
      gst_rate: product.gst_rate.toString(),
      current_stock: product.current_stock.toString(),
      min_stock_level: product.min_stock_level.toString(),
      max_stock_level: product.max_stock_level?.toString() || "",
      supplier_id: (product as any).supplier_id || "",
      opening_stock_qty: (product as any).opening_stock_qty?.toString() || "",
      opening_stock_value: (product as any).opening_stock_value?.toString() || ""
    });
    setEditingProduct(product);
    setOpen(true);
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('suppliers')
        .insert([{ 
          ...newSupplierData, 
          user_id: user.id, 
          company_id: selectedCompany?.company_name || null 
        }])
        .select()
        .single();

      if (error) throw error;

      // Update suppliers list
      setSuppliers(prev => [...prev, data]);
      
      // Select the new supplier
      setFormData(prev => ({ ...prev, supplier_id: data.id }));
      
      // Reset supplier form
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
      
      toast({
        title: "Success",
        description: "Supplier added successfully"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create supplier",
        variant: "destructive"
      });
    }
  };

  const getStockStatus = (product: Product) => {
    if (product.current_stock <= product.min_stock_level) return 'Low Stock';
    if (product.current_stock >= (product.max_stock_level || Infinity)) return 'Overstock';
    return 'In Stock';
  };

  const downloadProductReport = () => {
    const reportData = products.map(product => ({
      name: product.name,
      sku: product.sku || '',
      current_stock: product.current_stock,
      min_stock_level: product.min_stock_level,
      selling_price: product.selling_price || 0,
      status: getStockStatus(product)
    }));
    
    downloadReportAsCSV(
      'Products Report',
      reportData,
      ['name', 'sku', 'current_stock', 'min_stock_level', 'selling_price', 'status']
    );
    
    toast({ title: "Success", description: "Products report downloaded successfully" });
  };

  if (loading) {
    return <div className="text-center py-8">Loading products...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Products & Inventory</h2>
          <p className="text-muted-foreground">Manage your product catalog and inventory levels</p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadProductReport}>
            <Download className="w-4 h-4 mr-2" />
            Download Report
          </Button>
          
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="w-4 h-4 mr-2" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto modal-scrollbar smooth-scroll">
            <DialogHeader>
              <DialogTitle>
                {editingProduct ? "Edit Product" : "Add New Product"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                    placeholder="Unique product code"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="hsn_code">HSN Code</Label>
                  <Input
                    id="hsn_code"
                    value={formData.hsn_code}
                    onChange={(e) => setFormData(prev => ({ ...prev, hsn_code: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="unit">Unit</Label>
                  <Input
                    id="unit"
                    value={formData.unit}
                    onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="gst_rate">GST Rate (%)</Label>
                  <Input
                    id="gst_rate"
                    type="number"
                    step="0.01"
                    value={formData.gst_rate}
                    onChange={(e) => setFormData(prev => ({ ...prev, gst_rate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="purchase_price">Purchase Price (₹)</Label>
                  <Input
                    id="purchase_price"
                    type="number"
                    step="0.01"
                    value={formData.purchase_price}
                    onChange={(e) => setFormData(prev => ({ ...prev, purchase_price: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="selling_price">Selling Price (₹)</Label>
                  <Input
                    id="selling_price"
                    type="number"
                    step="0.01"
                    value={formData.selling_price}
                    onChange={(e) => setFormData(prev => ({ ...prev, selling_price: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="current_stock">Current Stock</Label>
                  <Input
                    id="current_stock"
                    type="number"
                    value={formData.current_stock}
                    onChange={(e) => setFormData(prev => ({ ...prev, current_stock: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="min_stock_level">Min Stock Level</Label>
                  <Input
                    id="min_stock_level"
                    type="number"
                    value={formData.min_stock_level}
                    onChange={(e) => setFormData(prev => ({ ...prev, min_stock_level: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="max_stock_level">Max Stock Level</Label>
                  <Input
                    id="max_stock_level"
                    type="number"
                    value={formData.max_stock_level}
                    onChange={(e) => setFormData(prev => ({ ...prev, max_stock_level: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="opening_stock_qty">
                    Opening Stock Qty (for first period only)
                  </Label>
                  <Input
                    id="opening_stock_qty"
                    type="number"
                    value={formData.opening_stock_qty}
                    onChange={(e) =>
                      setFormData(prev => ({ ...prev, opening_stock_qty: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="opening_stock_value">
                    Opening Stock Value (total cost)
                  </Label>
                  <Input
                    id="opening_stock_value"
                    type="number"
                    step="0.01"
                    value={formData.opening_stock_value}
                    onChange={(e) =>
                      setFormData(prev => ({ ...prev, opening_stock_value: e.target.value }))
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Used for P&amp;L opening stock valuation. Does not change live stock movements.
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="supplier_id">Primary Supplier</Label>
                <div className="flex gap-2">
                  <Select 
                    value={formData.supplier_id || undefined} 
                    onValueChange={(value) => {
                      if (value === "add_new") {
                        setSupplierDialogOpen(true);
                      } else if (value === "clear") {
                        setFormData(prev => ({ ...prev, supplier_id: "" }));
                      } else {
                        setFormData(prev => ({ ...prev, supplier_id: value }));
                      }
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select supplier (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.company_name}
                        </SelectItem>
                      ))}
                      {formData.supplier_id && (
                        <SelectItem value="clear" className="text-muted-foreground">
                          Clear Selection
                        </SelectItem>
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

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingProduct ? "Update" : "Add"} Product
                </Button>
              </div>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by name, SKU, HSN..."
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          className="flex-1"
        />
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="low-stock-filter"
            checked={showLowStockOnly}
            onChange={(e) => setShowLowStockOnly(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
          <label htmlFor="low-stock-filter" className="text-sm text-muted-foreground cursor-pointer">
            Show Low Stock Only
          </label>
        </div>
      </div>

      <div className="grid gap-4">
        {/* Bulk Import Section - Always Visible */}
        <div className="mb-4 p-4 bg-muted/50 rounded-lg border border-dashed border-border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-foreground mb-1">Bulk Import Products</h3>
              <p className="text-sm text-muted-foreground">Import multiple products from CSV files exported from Tally, SAP, or other ERP systems</p>
            </div>
            <Button 
              onClick={() => {
                if (!selectedCompany) {
                  toast({
                    title: "No Company Selected",
                    description: "Please select a company from the dropdown before importing products.",
                    variant: "destructive"
                  });
                  return;
                }
                setImportOpen(true);
              }} 
              variant="outline"
              disabled={!selectedCompany}
            >
              <Upload className="w-4 h-4 mr-2" />
              Bulk Import
            </Button>
          </div>
        </div>

        {products.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No products found. Add your first product to get started.</p>
              <p className="text-sm text-muted-foreground">Or use the Bulk Import button above to import products from CSV files.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {products
              .filter((p) => {
                // Apply low stock filter
                if (showLowStockOnly) {
                  // Only show products that have min_stock_level set AND current_stock <= min_stock_level
                  if (p.min_stock_level == null || p.min_stock_level === undefined) {
                    return false; // Exclude products without min_stock_level set
                  }
                  const currentStock = p.current_stock ?? 0;
                  const minStock = p.min_stock_level;
                  if (currentStock > minStock) return false; // Only show if stock is at or below min level
                }
                
                // Apply search filter
                if (!productSearch.trim()) return true;
                const term = productSearch.toLowerCase();
                return (
                  p.name.toLowerCase().includes(term) ||
                  (p.sku || '').toLowerCase().includes(term) ||
                  (p.hsn_code || '').toLowerCase().includes(term)
                );
              })
              .map((product) => {
              const stockStatus = getStockStatus(product);
              
              return (
                <Card key={product.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Package className="w-5 h-5" />
                          {product.name}
                          {product.sku && <Badge variant="outline">{product.sku}</Badge>}
                        </CardTitle>
                        {product.description && (
                          <CardDescription>{product.description}</CardDescription>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(product)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDelete(product.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Stock</p>
                      <p className="font-semibold flex items-center gap-1">
                        <Package className="w-4 h-4" />
                        {product.current_stock} {product.unit}
                      </p>
                    </div>
                    {product.purchase_price && (
                      <div>
                        <p className="text-sm text-muted-foreground">Purchase Price</p>
                        <p className="font-semibold">{formatIndianCurrency(product.purchase_price)}</p>
                      </div>
                    )}
                    {product.selling_price && (
                      <div>
                        <p className="text-sm text-muted-foreground">Selling Price</p>
                        <p className="font-semibold">{formatIndianCurrency(product.selling_price)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-muted-foreground">GST Rate</p>
                      <p className="font-semibold">{product.gst_rate}%</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-4">
                    {product.hsn_code && (
                      <Badge variant="secondary">HSN: {product.hsn_code}</Badge>
                    )}
                    {stockStatus === "Low Stock" && (
                      <Badge variant="destructive">Low Stock</Badge>
                    )}
                    {stockStatus === "Overstock" && (
                      <Badge variant="secondary">Overstocked</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          </>
        )}
      </div>

      {/* ERP Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto modal-scrollbar">
          <DialogHeader>
            <DialogTitle>Bulk Import Products</DialogTitle>
            <DialogDescription>
              Import multiple products from CSV files exported from Tally, SAP, or other ERP systems
            </DialogDescription>
          </DialogHeader>
          <ERPImportManager 
            onClose={() => {
              setImportOpen(false);
            }}
            onImportComplete={() => {
              fetchProducts(); // Refresh products after successful import
            }}
          />
        </DialogContent>
      </Dialog>

      {/* New Supplier Dialog */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Supplier</DialogTitle>
            <DialogDescription>
              Create a new supplier that will be associated with your product
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSupplier} className="space-y-4">
            <div>
              <Label htmlFor="new_supplier_company_name">Company Name *</Label>
              <Input
                id="new_supplier_company_name"
                value={newSupplierData.company_name}
                onChange={(e) => setNewSupplierData(prev => ({ ...prev, company_name: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="new_supplier_contact_person">Contact Person</Label>
              <Input
                id="new_supplier_contact_person"
                value={newSupplierData.contact_person}
                onChange={(e) => setNewSupplierData(prev => ({ ...prev, contact_person: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="new_supplier_email">Email</Label>
              <Input
                id="new_supplier_email"
                type="email"
                value={newSupplierData.email}
                onChange={(e) => setNewSupplierData(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="new_supplier_phone">Phone</Label>
              <Input
                id="new_supplier_phone"
                value={newSupplierData.phone}
                onChange={(e) => setNewSupplierData(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="new_supplier_address">Address</Label>
              <Textarea
                id="new_supplier_address"
                value={newSupplierData.address}
                onChange={(e) => setNewSupplierData(prev => ({ ...prev, address: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="new_supplier_gstin">GSTIN</Label>
                <Input
                  id="new_supplier_gstin"
                  value={newSupplierData.gstin}
                  onChange={(e) => setNewSupplierData(prev => ({ ...prev, gstin: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="new_supplier_pan">PAN</Label>
                <Input
                  id="new_supplier_pan"
                  value={newSupplierData.pan}
                  onChange={(e) => setNewSupplierData(prev => ({ ...prev, pan: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setSupplierDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                Add Supplier
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={(open) => {
        setShowDeleteDialog(open);
        if (!open) {
          setProductToDelete(null);
          setProductUsageInfo(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this product? This action cannot be undone.
              {productUsageInfo && (productUsageInfo.invoiceCount > 0 || productUsageInfo.poCount > 0) && (
                <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    ⚠️ Warning: This product is currently used in:
                  </p>
                  <ul className="mt-2 text-sm text-yellow-700 dark:text-yellow-300 list-disc list-inside">
                    {productUsageInfo.invoiceCount > 0 && (
                      <li>{productUsageInfo.invoiceCount} invoice(s)</li>
                    )}
                    {productUsageInfo.poCount > 0 && (
                      <li>{productUsageInfo.poCount} purchase order(s)</li>
                    )}
                  </ul>
                  <p className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
                    The product will be removed from these records, but the invoice/purchase order data will be preserved.
                  </p>
                </div>
              )}
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