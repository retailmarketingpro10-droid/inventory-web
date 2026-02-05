import React, { useState } from "react";
import { Upload, FileText, AlertCircle, CheckCircle, AlertTriangle, Info, Download } from "lucide-react";
import { parseTallyCSV, generateTallyCompatibleCSV, type TallyProduct, type TallyParseResult } from "@/utils/tallyParser";
import { formatIndianCurrency } from "@/utils/indianBusiness";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface TallyImportProcessorProps {
  onImportComplete: (products: TallyProduct[]) => void;
  onClose: () => void;
}

export function TallyImportProcessor({ onImportComplete, onClose }: TallyImportProcessorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<TallyParseResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'preview' | 'complete'>('upload');

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
      alert('Please select a CSV, Excel (xlsx/xls), or JSON file exported from Tally');
      return;
    }

    setFile(selectedFile);
    setIsProcessing(true);

    try {
      // Parse file content (supports CSV, Excel, JSON)
      const { parseFileContent } = await import('@/utils/fileParser');
      const rows = await parseFileContent(selectedFile);
      
      // Convert rows to CSV string format for existing parser
      const csvContent = rows.map(row => row.map(cell => {
        // Escape cells containing commas or quotes
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')).join('\n');
      
      const result = parseTallyCSV(csvContent);
      setParseResult(result);
      setCurrentStep('preview');
    } catch (error) {
      logger.error('Error processing file:', error);
      alert('Error processing file. Please ensure it\'s a valid CSV, Excel, or JSON file from Tally.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = () => {
    if (parseResult?.data) {
      onImportComplete(parseResult.data);
      setCurrentStep('complete');
    }
  };

  const downloadSampleTemplate = () => {
    const sampleData: TallyProduct[] = [
      {
        itemName: "Steel Rod 12mm",
        stockItem: "STEEL-ROD-12",
        alias: "TMT Bar",
        partNumber: "SR12-500",
        category: "Construction Materials",
        unit: "Kg",
        openingStock: 1000,
        currentStock: 750,
        rate: 65.50,
        mrp: 70.00,
        lastPurchaseRate: 60.00,
        gstRate: 18,
        hsnCode: "7213",
        minStock: 100,
        location: "Warehouse A"
      },
      {
        itemName: "Cement OPC 53 Grade",
        stockItem: "CEMENT-OPC53",
        category: "Construction Materials",
        unit: "Bag",
        openingStock: 500,
        currentStock: 320,
        rate: 420.00,
        mrp: 450.00,
        gstRate: 28,
        hsnCode: "2523",
        minStock: 50,
        location: "Warehouse B"
      }
    ];

    const csvContent = generateTallyCompatibleCSV(sampleData);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tally_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getTotalValue = (products: TallyProduct[]): number => {
    return products.reduce((total, product) => total + (product.currentStock * product.rate), 0);
  };

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
          {/* Tally Instructions */}
          <div className="bg-info/10 border border-info/20 rounded-lg p-4">
            <h3 className="font-semibold text-info mb-3 flex items-center gap-2">
              <Info className="h-4 w-4" />
              How to Export from Tally
            </h3>
            <ol className="text-info/90 text-sm space-y-2 list-decimal list-inside">
              <li>Open Tally ERP and go to <strong>Gateway of Tally</strong></li>
              <li>Navigate to <strong>Display → Inventory Reports → Stock Summary</strong></li>
              <li>Press <strong>Alt + E</strong> to export or go to <strong>Export → Excel/CSV/JSON</strong></li>
              <li>Choose <strong>CSV, Excel, or JSON format</strong> and save the file</li>
              <li>Upload the exported file below (CSV, Excel, or JSON supported)</li>
            </ol>
            <div className="mt-2 pt-2 border-t border-info/20">
              <strong className="text-info">Supported Formats:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1 text-sm">
                <li>CSV (.csv) - Most common format</li>
                <li>Excel (.xlsx, .xls) - Microsoft Excel files</li>
                <li>JSON (.json) - JavaScript Object Notation</li>
              </ul>
            </div>
          </div>

          {/* File Upload */}
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Upload Tally Export File
            </h3>
            <p className="text-muted-foreground mb-4">
              Supports CSV, Excel (xlsx/xls), and JSON files exported from Tally ERP or Tally Prime
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
              disabled={isProcessing}
            />
            <label
              htmlFor="file-upload"
              className={cn(
                "inline-flex items-center gap-2 px-6 py-3 rounded-md transition-colors cursor-pointer",
                isProcessing 
                  ? "bg-muted text-muted-foreground cursor-not-allowed" 
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
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
            <h3 className="font-semibold text-card-foreground mb-3">Don't have a Tally file?</h3>
            <p className="text-muted-foreground text-sm mb-3">
              Download our sample template to see the expected format
            </p>
            <button
              onClick={downloadSampleTemplate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download Sample Template
            </button>
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
              <div className="text-sm text-primary/80">Products</div>
            </div>
            <div className="bg-success/10 border border-success/20 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-success">
                {formatIndianCurrency(getTotalValue(parseResult.data), false)}
              </div>
              <div className="text-sm text-success/80">Total Value</div>
            </div>
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-warning">{parseResult.warnings.length}</div>
              <div className="text-sm text-warning/80">Warnings</div>
            </div>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-destructive">{parseResult.errors.length}</div>
              <div className="text-sm text-destructive/80">Errors</div>
            </div>
          </div>

          {/* Errors */}
          {parseResult.errors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <h4 className="font-semibold text-destructive mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Errors ({parseResult.errors.length})
              </h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
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

          {/* Warnings */}
          {parseResult.warnings.length > 0 && (
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
              <h4 className="font-semibold text-warning mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Warnings ({parseResult.warnings.length})
              </h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
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

          {/* Product Preview */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h4 className="font-semibold text-card-foreground mb-3">Product Preview (First 5 items)</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2">Item Name</th>
                    <th className="text-left py-2">Stock</th>
                    <th className="text-left py-2">Unit</th>
                    <th className="text-right py-2">Rate</th>
                    <th className="text-right py-2">Value</th>
                    <th className="text-center py-2">GST%</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.data.slice(0, 5).map((product, index) => (
                    <tr key={index} className="border-b border-border/50">
                      <td className="py-2 font-medium">{product.itemName}</td>
                      <td className="py-2">{product.currentStock}</td>
                      <td className="py-2">{product.unit}</td>
                      <td className="py-2 text-right">{formatIndianCurrency(product.rate)}</td>
                      <td className="py-2 text-right">{formatIndianCurrency(product.currentStock * product.rate)}</td>
                      <td className="py-2 text-center">{product.gstRate || '-'}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parseResult.data.length > 5 && (
                <div className="text-center py-2 text-muted-foreground text-sm">
                  ... and {parseResult.data.length - 5} more items
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep('upload')}
              className="px-4 py-2 border border-input rounded-md text-foreground hover:bg-accent transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={parseResult.data.length === 0}
              className={cn(
                "px-6 py-2 rounded-md transition-colors",
                parseResult.data.length > 0
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              Import {parseResult.data.length} Products
            </button>
          </div>
        </div>
      )}

      {/* Complete Step */}
      {currentStep === 'complete' && (
        <div className="text-center py-8">
          <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">Import Completed!</h3>
          <p className="text-muted-foreground mb-6">
            Successfully imported {parseResult?.summary.processed} products from your Tally export
          </p>
          <button
            onClick={onClose}
            className="bg-primary text-primary-foreground px-6 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}