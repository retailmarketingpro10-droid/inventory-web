import React, { useState, useEffect } from "react";
import { Upload, FileText, AlertCircle, CheckCircle, AlertTriangle, Info, Download, Users, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { parseERPData, generateSampleCSV, type ERPParseResult, type ERPProduct, type ERPSupplier } from "@/utils/erpParser";
import { parseFileContent, getFileFormatDescription } from "@/utils/fileParser";
import { formatIndianCurrency } from "@/utils/indianBusiness";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface ERPImportManagerProps {
  onClose: () => void;
  onImportComplete?: () => void;
}

export function ERPImportManager({ onClose, onImportComplete }: ERPImportManagerProps) {
  const { selectedCompany } = useCompany();
  const [activeTab, setActiveTab] = useState<'products' | 'suppliers'>('products');
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ERPParseResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'preview' | 'complete'>('upload');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [suppliers, setSuppliers] = useState<Array<{ id: string; company_name: string }>>([]);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type - support CSV, Excel, and JSON
    const fileName = selectedFile.name.toLowerCase();
    const fileType = selectedFile.type;
    const allowedExtensions = ['.csv', '.xlsx', '.xls', '.json'];
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/json'
    ];
    
    const isValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
    const isValidType = allowedTypes.includes(fileType) || fileType === '';
    
    if (!isValidExtension && !isValidType) {
      toast({
        title: "Invalid File Type",
        description: "Please select a CSV, Excel (xlsx/xls), or JSON file",
        variant: "destructive"
      });
      return;
    }

    setFile(selectedFile);
    setIsProcessing(true);

    try {
      // Parse file content (supports CSV, Excel, JSON)
      const rows = await parseFileContent(selectedFile);
      
      // Convert rows to CSV string format for existing parser
      const csvContent = rows.map(row => row.map(cell => {
        // Escape cells containing commas or quotes
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')).join('\n');
      
      const result = parseERPData(csvContent, activeTab);
      setParseResult(result);
      setCurrentStep('preview');
      
      const formatDesc = getFileFormatDescription(selectedFile);
      toast({
        title: "File Processed",
        description: `Successfully parsed ${formatDesc} file with ${rows.length} rows`,
      });
    } catch (error) {
      logger.error('Error processing file:', error);
      toast({
        title: "Processing Error",
        description: error instanceof Error ? error.message : "Error processing file. Please ensure it's a valid CSV, Excel, or JSON file.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!parseResult?.data) return;

    if (!selectedCompany?.company_name) {
      toast({
        title: "Error",
        description: "Please select a company before importing data",
        variant: "destructive"
      });
      return;
    }

    setIsImporting(true);
    try {
      if (activeTab === 'products') {
        const products = parseResult.data as ERPProduct[];
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error('User not authenticated');

        // First, process suppliers from product data
        const supplierMap = new Map<string, string>(); // Maps supplier identifier to supplier_id
        let suppliersCreatedCount = 0;
        
        // Extract unique suppliers from products
        const suppliersFromProducts = products
          .filter(p => p.supplierCompany || p.supplierName || p.supplierGSTIN)
          .map(p => ({
            company_name: p.supplierCompany || p.supplierName || 'Unknown Supplier',
            contact_person: p.supplierContact || p.supplierName || null,
            phone: p.supplierPhone || null,
            email: p.supplierEmail || null,
            address: p.supplierAddress || null,
            gstin: p.supplierGSTIN || null,
            pan: p.supplierPAN || null,
            identifier: p.supplierGSTIN || p.supplierCompany || p.supplierName || ''
          }))
          .filter((s, index, self) => 
            index === self.findIndex(t => 
              (t.gstin && t.gstin === s.gstin) || 
              (!t.gstin && t.company_name.toLowerCase() === s.company_name.toLowerCase())
            )
          );

        // Check existing suppliers and create new ones
        if (suppliersFromProducts.length > 0) {
          const existingSuppliers = await supabase
            .from('suppliers')
            .select('id, company_name, gstin')
            .eq('company_id', selectedCompany.company_name)
            .eq('user_id', userData.user.id);

          const existingMap = new Map<string, string>();
          (existingSuppliers.data || []).forEach(s => {
            const key = s.gstin || s.company_name.toLowerCase();
            existingMap.set(key, s.id);
          });

          // Create new suppliers
          const suppliersToCreate = suppliersFromProducts
            .filter(s => {
              const key = s.gstin || s.company_name.toLowerCase();
              return !existingMap.has(key);
            })
            .map(s => ({
              company_name: s.company_name,
              contact_person: s.contact_person,
              phone: s.phone,
              email: s.email,
              address: s.address,
              gstin: s.gstin,
              pan: s.pan,
              user_id: userData.user.id,
              company_id: selectedCompany.company_name
            }));

          if (suppliersToCreate.length > 0) {
            const { data: newSuppliers, error: supplierError } = await supabase
              .from('suppliers')
              .insert(suppliersToCreate)
              .select('id, company_name, gstin');

            if (supplierError) {
              logger.error('Error creating suppliers:', supplierError);
            } else {
              suppliersCreatedCount = newSuppliers?.length || 0;
              // Add new suppliers to map
              newSuppliers?.forEach(s => {
                const key = s.gstin || s.company_name.toLowerCase();
                supplierMap.set(key, s.id);
              });
            }
          }

          // Add existing suppliers to map
          existingMap.forEach((id, key) => {
            supplierMap.set(key, id);
          });
        }

        // Map products to supplier IDs
        const productsToInsert = products.map(product => {
          // Determine supplier ID
          let supplierId = selectedSupplierId || null;
          
          if (!supplierId && (product.supplierCompany || product.supplierName || product.supplierGSTIN)) {
            const supplierKey = product.supplierGSTIN || 
                              product.supplierCompany?.toLowerCase() || 
                              product.supplierName?.toLowerCase() || '';
            supplierId = supplierMap.get(supplierKey) || null;
          }

          // Opening stock is for reporting (P&L opening stock) and should
          // come from an explicit opening quantity in the ERP file, not
          // from the current live stock figure.
          const openingQty = product.openingStockQty ?? 0;

          // Base cost for inventory (used only for opening_stock_value when present)
          const baseCost =
            product.purchasePrice ??
            // Fallbacks from legacy files, if present on the parsed object
            (product as any).lastPurchaseRate ??
            (product as any).rate ??
            0;

          // If the ERP file provided an explicit opening value, prefer it.
          // Otherwise, derive it from openingQty × baseCost when both are sensible.
          let openingValue = product.openingStockValue ?? null;
          if ((openingValue === null || typeof openingValue === 'undefined') && openingQty > 0 && baseCost > 0) {
            openingValue = openingQty * baseCost;
          }

          return {
            name: product.name,
            sku: product.sku?.trim() || null,
            description: product.description || null,
            hsn_code: product.hsnCode || null,
            unit: product.unit || 'Nos',
            selling_price: product.sellingPrice || null,
            // Keep purchase_price as explicitly provided; do not
            // auto-fill it from generic rate to avoid distorting
            // existing P&L and stock valuations.
            purchase_price: product.purchasePrice || null,
            gst_rate: product.gstRate || 18,
            current_stock: product.currentStock || 0,
            min_stock_level: product.minStock || 0,
            max_stock_level: product.maxStock || null,
            supplier_id: supplierId,
            // Opening stock is used only for reporting (P&L opening stock), not for live stock movements.
            opening_stock_qty: openingQty,
            opening_stock_value: openingValue
          };
        });

        // Check for existing products in the database to prevent duplicates
        const productNames = productsToInsert.map(p => p.name.trim().toLowerCase());
        const { data: existingProducts, error: checkError } = await supabase
          .from('products')
          .select('id, name, sku, company_id')
          .eq('company_id', selectedCompany.company_name)
          .eq('user_id', userData.user.id);

        if (checkError) {
          logger.error('Error checking existing products:', checkError);
          // Continue with import but log the error
        }

        // Create sets of existing product names and SKUs for quick lookup
        const existingNames = new Set(
          (existingProducts || []).map(p => p.name.trim().toLowerCase())
        );
        const existingSKUs = new Set(
          (existingProducts || []).filter(p => p.sku).map(p => p.sku!.trim().toLowerCase())
        );

        // Remove duplicates within the import batch (keep first occurrence)
        const seenSKUs = new Set<string>();
        const seenNames = new Set<string>();
        const duplicateInBatch: string[] = [];
        const duplicateInDatabase: string[] = [];
        
        const uniqueProducts = productsToInsert.filter((product, index) => {
          const productNameLower = product.name.trim().toLowerCase();
          const productSKU = product.sku?.trim().toLowerCase();
          
          // Check for duplicates within the batch
          if (seenNames.has(productNameLower)) {
            duplicateInBatch.push(`Row ${index + 2}: "${product.name}" (duplicate in import file)`);
            return false; // Skip duplicate in batch
          }
          
          if (productSKU && seenSKUs.has(productSKU)) {
            duplicateInBatch.push(`Row ${index + 2}: SKU "${product.sku}" (duplicate in import file)`);
            return false; // Skip duplicate SKU in batch
          }
          
          // Check for duplicates in database
          if (existingNames.has(productNameLower)) {
            duplicateInDatabase.push(`"${product.name}"`);
            return false; // Skip duplicate in database
          }
          
          if (productSKU && existingSKUs.has(productSKU)) {
            duplicateInDatabase.push(`SKU "${product.sku}"`);
            return false; // Skip duplicate SKU in database
          }
          
          // Add to seen sets
          seenNames.add(productNameLower);
          if (productSKU) {
            seenSKUs.add(productSKU);
          }
          
          return true;
        });

        const productsWithUser = uniqueProducts.map(product => ({
          ...product,
          user_id: userData.user.id,
          company_id: selectedCompany.company_name
        }));

        // Show warnings for duplicates
        if (duplicateInBatch.length > 0 || duplicateInDatabase.length > 0) {
          const duplicateMessages: string[] = [];
          if (duplicateInBatch.length > 0) {
            duplicateMessages.push(`${duplicateInBatch.length} duplicate(s) in import file skipped`);
          }
          if (duplicateInDatabase.length > 0) {
            duplicateMessages.push(`${duplicateInDatabase.length} existing product(s) in database skipped: ${duplicateInDatabase.slice(0, 5).join(', ')}${duplicateInDatabase.length > 5 ? ` and ${duplicateInDatabase.length - 5} more` : ''}`);
          }
          
          toast({
            title: "Duplicates Detected",
            description: duplicateMessages.join('. '),
            variant: "default"
          });
        }

        // Separate products with and without SKU
        const productsWithSKU = productsWithUser.filter(p => p.sku);
        const productsWithoutSKU = productsWithUser.filter(p => !p.sku);

        let processedCount = 0;
        let errors: string[] = [];

        // Upsert products with SKU (update if exists, insert if not)
        if (productsWithSKU.length > 0) {
          const { error: upsertError } = await supabase
            .from('products')
            .upsert(productsWithSKU, {
              onConflict: 'sku',
              ignoreDuplicates: false
            });

          if (upsertError) {
            errors.push(`Failed to import products with SKU: ${upsertError.message}`);
          } else {
            processedCount += productsWithSKU.length;
          }
        }

        // Insert products without SKU normally
        if (productsWithoutSKU.length > 0) {
          const { error: insertError } = await supabase
            .from('products')
            .insert(productsWithoutSKU);

          if (insertError) {
            errors.push(`Failed to import products without SKU: ${insertError.message}`);
          } else {
            processedCount += productsWithoutSKU.length;
          }
        }

        if (errors.length > 0) {
          throw new Error(errors.join('; '));
        }

        const skippedCount = products.length - uniqueProducts.length;
        let message = `Successfully imported ${processedCount} products`;
        
        // Add supplier creation info
        if (suppliersFromProducts.length > 0) {
          if (suppliersCreatedCount > 0) {
            message += `. ${suppliersCreatedCount} supplier(s) created automatically.`;
          } else if (supplierMap.size > 0) {
            message += `. Linked to ${supplierMap.size} existing supplier(s).`;
          }
        }
        
        if (skippedCount > 0) {
          const duplicateInFileCount = duplicateInBatch.length;
          const duplicateInDbCount = duplicateInDatabase.length;
          message += ` ${skippedCount} duplicate(s) skipped (${duplicateInFileCount} in file, ${duplicateInDbCount} already in database).`;
        }

        toast({
          title: "Products Imported",
          description: message
        });
      } else {
        const suppliers = parseResult.data as ERPSupplier[];
        
        // Get user for RLS
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error('User not authenticated');

        // Check for existing suppliers in the database to prevent duplicates
        const { data: existingSuppliers, error: checkError } = await supabase
          .from('suppliers')
          .select('id, company_name')
          .eq('company_id', selectedCompany.company_name)
          .eq('user_id', userData.user.id);

        if (checkError) {
          logger.error('Error checking existing suppliers:', checkError);
        }

        // Create set of existing supplier names for quick lookup
        const existingNames = new Set(
          (existingSuppliers || []).map(s => s.company_name.trim().toLowerCase())
        );

        // Remove duplicates within the import batch and against database
        const seenNames = new Set<string>();
        const duplicateInBatch: string[] = [];
        const duplicateInDatabase: string[] = [];
        
        const uniqueSuppliers = suppliers.filter((supplier, index) => {
          const supplierNameLower = supplier.name.trim().toLowerCase();
          
          // Check for duplicates within the batch
          if (seenNames.has(supplierNameLower)) {
            duplicateInBatch.push(`Row ${index + 2}: "${supplier.name}" (duplicate in import file)`);
            return false;
          }
          
          // Check for duplicates in database
          if (existingNames.has(supplierNameLower)) {
            duplicateInDatabase.push(`"${supplier.name}"`);
            return false;
          }
          
          seenNames.add(supplierNameLower);
          return true;
        });

        // Show warnings for duplicates
        if (duplicateInBatch.length > 0 || duplicateInDatabase.length > 0) {
          const duplicateMessages: string[] = [];
          if (duplicateInBatch.length > 0) {
            duplicateMessages.push(`${duplicateInBatch.length} duplicate(s) in import file skipped`);
          }
          if (duplicateInDatabase.length > 0) {
            duplicateMessages.push(`${duplicateInDatabase.length} existing supplier(s) in database skipped: ${duplicateInDatabase.slice(0, 5).join(', ')}${duplicateInDatabase.length > 5 ? ` and ${duplicateInDatabase.length - 5} more` : ''}`);
          }
          
          toast({
            title: "Duplicates Detected",
            description: duplicateMessages.join('. '),
            variant: "default"
          });
        }

        if (uniqueSuppliers.length === 0) {
          toast({
            title: "No Suppliers to Import",
            description: "All suppliers in the file are duplicates or already exist in the database.",
            variant: "default"
          });
          setCurrentStep('complete');
          if (onImportComplete) {
            onImportComplete();
          }
          return;
        }

        // First, insert into business_entities
        const entitiesToInsert = uniqueSuppliers.map(supplier => ({
          name: supplier.name,
          entity_type: 'supplier',
          contact_person: supplier.contactPerson || null,
          phone: supplier.phone || null,
          email: supplier.email || null,
          address: supplier.address || null,
          gstin: supplier.gstin || null,
          pan: supplier.pan || null,
          user_id: userData.user.id
        }));

        const { error: entitiesError } = await supabase
          .from('business_entities')
          .insert(entitiesToInsert);

        if (entitiesError) {
          logger.error('Error inserting business entities:', entitiesError);
          // Continue with suppliers insert even if entities fail
        }

        // Also insert into suppliers for backward compatibility with company_id
        const suppliersToInsert = uniqueSuppliers.map(supplier => ({
          company_name: supplier.name,
          contact_person: supplier.contactPerson || null,
          phone: supplier.phone || null,
          email: supplier.email || null,
          address: supplier.address || null,
          gstin: supplier.gstin || null,
          pan: supplier.pan || null,
          user_id: userData.user.id,
          company_id: selectedCompany.company_name
        }));

        const { error: suppliersError } = await supabase
          .from('suppliers')
          .insert(suppliersToInsert);

        if (suppliersError) throw suppliersError;

        const skippedCount = suppliers.length - uniqueSuppliers.length;
        let message = `Successfully imported ${uniqueSuppliers.length} suppliers`;
        if (skippedCount > 0) {
          message += `. ${skippedCount} duplicate(s) skipped.`;
        }

        toast({
          title: "Suppliers Imported",
          description: message
        });
      }

      setCurrentStep('complete');
      
      // Trigger refresh callback if provided
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (error: any) {
      logger.error('Import error:', error);
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsImporting(false);
    }
  };

  const downloadSampleTemplate = () => {
    const csvContent = generateSampleCSV(activeTab);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}_import_template.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const resetForm = React.useCallback(() => {
    setFile(null);
    setParseResult(null);
    setCurrentStep('upload');
    setSelectedSupplierId("");
  }, []);

  // Reset form state when switching tabs
  React.useEffect(() => {
    resetForm();
  }, [activeTab, resetForm]);

  // Fetch suppliers when component mounts or company changes
  React.useEffect(() => {
    const fetchSuppliers = async () => {
      if (!selectedCompany?.company_name) {
        setSuppliers([]);
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('suppliers')
          .select('id, company_name')
          .eq('company_id', selectedCompany.company_name)
          .eq('user_id', user.id)
          .order('company_name');

        if (error) {
          logger.error('Error fetching suppliers:', error);
          setSuppliers([]);
        } else {
          setSuppliers(data || []);
        }
      } catch (error) {
        logger.error('Error fetching suppliers:', error);
        setSuppliers([]);
      }
    };

    fetchSuppliers();
  }, [selectedCompany]);

  const getTotalValue = (): number => {
    if (!parseResult?.data) return 0;
    if (activeTab === 'products') {
      const products = parseResult.data as ERPProduct[];
      return products.reduce((total, product) => total + ((product.currentStock || 0) * (product.sellingPrice || 0)), 0);
    }
    return 0;
  };

  return (
    <div className="space-y-6 modal-scrollbar">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">ERP Data Import</h2>
          <p className="text-muted-foreground">Import products and suppliers from Tally, SAP, or other ERP systems</p>
          {selectedCompany && (
            <p className="text-sm text-primary mt-1">
              Importing to: <strong>{selectedCompany.company_name}</strong>
            </p>
          )}
          {!selectedCompany && (
            <p className="text-sm text-destructive mt-1">
              ⚠️ Please select a company from the dropdown before importing
            </p>
          )}
        </div>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>

      {/* Import Type Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'products' | 'suppliers')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Products
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Suppliers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Import Products</CardTitle>
              <CardDescription>
                Upload product data from your ERP system including stock levels, pricing, and tax information. 
                Supplier information is optional and can be assigned later through product edit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImportContent
                type="products"
                file={file}
                parseResult={parseResult}
                isProcessing={isProcessing}
                isImporting={isImporting}
                currentStep={currentStep}
                onFileUpload={handleFileUpload}
                onConfirmImport={handleConfirmImport}
                onDownloadTemplate={downloadSampleTemplate}
                onReset={resetForm}
                getTotalValue={getTotalValue}
                selectedSupplierId={selectedSupplierId}
                onSupplierChange={setSelectedSupplierId}
                suppliers={suppliers}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Import Suppliers</CardTitle>
              <CardDescription>
                Upload supplier/vendor data including contact information and tax details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImportContent
                type="suppliers"
                file={file}
                parseResult={parseResult}
                isProcessing={isProcessing}
                isImporting={isImporting}
                currentStep={currentStep}
                onFileUpload={handleFileUpload}
                onConfirmImport={handleConfirmImport}
                onDownloadTemplate={downloadSampleTemplate}
                onReset={resetForm}
                getTotalValue={getTotalValue}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ImportContentProps {
  type: 'products' | 'suppliers';
  file: File | null;
  parseResult: ERPParseResult | null;
  isProcessing: boolean;
  isImporting: boolean;
  currentStep: 'upload' | 'preview' | 'complete';
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirmImport: () => void;
  onDownloadTemplate: () => void;
  onReset: () => void;
  getTotalValue: () => number;
  selectedSupplierId?: string;
  onSupplierChange?: (supplierId: string) => void;
  suppliers?: Array<{ id: string; company_name: string }>;
}

function ImportContent({
  type,
  file,
  parseResult,
  isProcessing,
  isImporting,
  currentStep,
  onFileUpload,
  onConfirmImport,
  onDownloadTemplate,
  onReset,
  getTotalValue,
  selectedSupplierId = "",
  onSupplierChange,
  suppliers = []
}: ImportContentProps) {
  const { selectedCompany } = useCompany();
  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-center space-x-4 mb-6">
        <div className={cn(
          "flex items-center space-x-2 px-3 py-1 rounded-full text-sm",
          currentStep === 'upload' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}>
          <Upload className="h-4 w-4" />
          <span>Upload</span>
        </div>
        <div className="w-8 h-0.5 bg-border"></div>
        <div className={cn(
          "flex items-center space-x-2 px-3 py-1 rounded-full text-sm",
          currentStep === 'preview' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}>
          <FileText className="h-4 w-4" />
          <span>Preview</span>
        </div>
        <div className="w-8 h-0.5 bg-border"></div>
        <div className={cn(
          "flex items-center space-x-2 px-3 py-1 rounded-full text-sm",
          currentStep === 'complete' ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
        )}>
          <CheckCircle className="h-4 w-4" />
          <span>Complete</span>
        </div>
      </div>

      {/* Upload Step */}
      {currentStep === 'upload' && (
        <div className="space-y-6">
          {/* Instructions */}
          <div className="bg-info/10 border border-info/20 rounded-lg p-4">
            <h3 className="font-semibold text-info mb-3 flex items-center gap-2">
              <Info className="h-4 w-4" />
              How to Export from Your ERP System
            </h3>
            <div className="text-info/90 text-sm space-y-3">
              <div>
                <strong>For Tally ERP:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1">
                  <li>Go to Gateway of Tally → Display → {type === 'products' ? 'Inventory Reports → Stock Summary' : 'Accounts Books → Ledger'}</li>
                  <li>Press Alt + E to export or go to Export → CSV or Excel</li>
                  <li>Save as CSV/Excel/JSON and upload below</li>
                </ol>
              </div>
              <div>
                <strong>For SAP/Other ERP:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1">
                  <li>Export {type} master data to CSV, Excel, or JSON format</li>
                  <li>Ensure required fields are included (see template)</li>
                  <li>Upload the file below (CSV, Excel, or JSON supported)</li>
                </ol>
              </div>
              <div className="mt-2 pt-2 border-t border-info/20">
                <strong className="text-info">Supported Formats:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1 text-sm">
                  <li>CSV (.csv) - Most common format</li>
                  <li>Excel (.xlsx, .xls) - Microsoft Excel files</li>
                  <li>JSON (.json) - JavaScript Object Notation</li>
                </ul>
              </div>
            </div>
          </div>

          {/* File Upload */}
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Upload {type.charAt(0).toUpperCase() + type.slice(1)} Data
            </h3>
            <p className="text-muted-foreground mb-4">
              Supports CSV, Excel (xlsx/xls), and JSON files from Tally, SAP, or other ERP systems
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              onChange={onFileUpload}
              className="hidden"
              id={`file-upload-${type}`}
              key={`file-upload-${type}`}
              disabled={isProcessing || !selectedCompany}
            />
            <label
              htmlFor={`file-upload-${type}`}
              className={cn(
                "inline-flex items-center gap-2 px-6 py-3 rounded-md transition-colors",
                isProcessing || !selectedCompany
                  ? "bg-muted text-muted-foreground cursor-not-allowed" 
                  : "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
              )}
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Choose File
                </>
              )}
            </label>
          </div>

          {/* Sample Template */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="font-semibold text-card-foreground mb-3">Need a template?</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Download our sample template to see the expected format and required fields
            </p>
            <Button
              variant="secondary"
              onClick={onDownloadTemplate}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download {type.charAt(0).toUpperCase() + type.slice(1)} Template
            </Button>
          </div>
        </div>
      )}

      {/* Preview Step */}
      {currentStep === 'preview' && parseResult && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Import Preview</h3>
            <div className="text-sm text-muted-foreground">
              File: {file?.name}
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-primary">{parseResult.summary.processed}</div>
              <div className="text-sm text-primary/80">{type.charAt(0).toUpperCase() + type.slice(1)}</div>
            </div>
            {type === 'products' && (
              <div className="bg-success/10 border border-success/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-success">
                  {formatIndianCurrency(getTotalValue(), false)}
                </div>
                <div className="text-sm text-success/80">Total Value</div>
              </div>
            )}
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-warning">{parseResult.warnings.length}</div>
              <div className="text-sm text-warning/80">Warnings</div>
            </div>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-destructive">{parseResult.errors.length}</div>
              <div className="text-sm text-destructive/80">Errors</div>
            </div>
          </div>

          {/* Errors and Warnings */}
          {parseResult.errors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <h4 className="font-semibold text-destructive mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Errors ({parseResult.errors.length})
              </h4>
              <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-beautiful">
                {parseResult.errors.slice(0, 10).map((error, index) => (
                  <div key={index} className="text-sm text-destructive/90">
                    Row {error.row}: {error.error}
                  </div>
                ))}
                {parseResult.errors.length > 10 && (
                  <div className="text-sm text-destructive/70 italic">
                    ... and {parseResult.errors.length - 10} more errors
                  </div>
                )}
              </div>
            </div>
          )}

          {parseResult.warnings.length > 0 && (
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
              <h4 className="font-semibold text-warning mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Warnings ({parseResult.warnings.length})
              </h4>
              <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-beautiful">
                {parseResult.warnings.slice(0, 5).map((warning, index) => (
                  <div key={index} className="text-sm text-warning/90">
                    Row {warning.row}: {warning.warnings.join(', ')}
                  </div>
                ))}
                {parseResult.warnings.length > 5 && (
                  <div className="text-sm text-warning/70 italic">
                    ... and {parseResult.warnings.length - 5} more warnings
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Assign Supplier (Optional) - Only show for products */}
          {type === 'products' && (
            <div className="bg-card rounded-lg shadow-sm p-4 border border-border" key="supplier-assignment-section">
              <div className="space-y-2">
                <Label htmlFor="supplier-select" className="text-base font-semibold">
                  Assign Supplier (Optional)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Select a supplier to assign to all imported products, or leave empty to assign later on the product details page.
                </p>
                {suppliers.length === 0 ? (
                  <div className="p-3 bg-muted/50 rounded-lg border border-border">
                    <p className="text-sm text-muted-foreground">
                      No suppliers found. You can import suppliers first or assign suppliers later on the product details page.
                    </p>
                  </div>
                ) : (
                <Select
                  value={selectedSupplierId || "__none__"}
                  onValueChange={(value) => {
                    if (onSupplierChange) {
                      // Use empty string internally but "__none__" for the Select component
                      onSupplierChange(value === "__none__" ? "" : value);
                    }
                  }}
                >
                  <SelectTrigger id="supplier-select" className="w-full">
                    <SelectValue placeholder="Select Supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No Supplier (Assign Later)</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
                {selectedSupplierId && suppliers.length > 0 && (
                  <p className="text-xs text-primary mt-2">
                    ✓ All imported products will be assigned to: {suppliers.find(s => s.id === selectedSupplierId)?.company_name || 'Selected Supplier'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Data Preview */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h4 className="font-semibold text-card-foreground mb-3">Data Preview (First 5 items)</h4>
            <div className="overflow-x-auto scrollbar-beautiful">
              {type === 'products' ? (
                <ProductPreviewTable data={parseResult.data as ERPProduct[]} />
              ) : (
                <SupplierPreviewTable data={parseResult.data as ERPSupplier[]} />
              )}
              {parseResult.data.length > 5 && (
                <div className="text-center py-2 text-muted-foreground text-sm">
                  ... and {parseResult.data.length - 5} more items
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={onReset}>
              Back
            </Button>
            <Button
              onClick={onConfirmImport}
              disabled={parseResult.data.length === 0 || isImporting}
            >
              {isImporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
                  Importing...
                </>
              ) : (
                `Import ${parseResult.data.length} ${type.charAt(0).toUpperCase() + type.slice(1)}`
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Complete Step */}
      {currentStep === 'complete' && (
        <div className="text-center py-8">
          <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">Import Completed!</h3>
          <p className="text-muted-foreground mb-6">
            Successfully imported {parseResult?.summary.processed} {type} from your ERP system
          </p>
          <Button onClick={onReset}>
            Import More Data
          </Button>
        </div>
      )}
    </div>
  );
}

function ProductPreviewTable({ data }: { data: ERPProduct[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border">
          <th className="text-left py-2">Product Name</th>
          <th className="text-left py-2">SKU</th>
          <th className="text-center py-2">Stock</th>
          <th className="text-center py-2">Unit</th>
          <th className="text-right py-2">Price</th>
          <th className="text-center py-2">GST%</th>
          <th className="text-left py-2">Supplier</th>
        </tr>
      </thead>
      <tbody>
        {data.slice(0, 5).map((product, index) => (
          <tr key={index} className="border-b border-border/50">
            <td className="py-2 font-medium">{product.name}</td>
            <td className="py-2">{product.sku || '-'}</td>
            <td className="py-2 text-center">{product.currentStock || 0}</td>
            <td className="py-2 text-center">{product.unit || 'Nos'}</td>
            <td className="py-2 text-right">{formatIndianCurrency(product.sellingPrice || 0)}</td>
            <td className="py-2 text-center">{product.gstRate || 18}%</td>
            <td className="py-2 text-left">
              {product.supplierCompany || product.supplierName || '-'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SupplierPreviewTable({ data }: { data: ERPSupplier[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border">
          <th className="text-left py-2">Company Name</th>
          <th className="text-left py-2">Contact Person</th>
          <th className="text-left py-2">Phone</th>
          <th className="text-left py-2">Email</th>
          <th className="text-left py-2">GSTIN</th>
        </tr>
      </thead>
      <tbody>
        {data.slice(0, 5).map((supplier, index) => (
          <tr key={index} className="border-b border-border/50">
            <td className="py-2 font-medium">{supplier.name}</td>
            <td className="py-2">{supplier.contactPerson || '-'}</td>
            <td className="py-2">{supplier.phone || '-'}</td>
            <td className="py-2">{supplier.email || '-'}</td>
            <td className="py-2">{supplier.gstin || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}