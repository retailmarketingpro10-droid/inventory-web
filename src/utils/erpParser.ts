// Enhanced ERP parser supporting products and suppliers from various systems
export interface ERPProduct {
  name: string;
  sku?: string;
  description?: string;
  category?: string;
  unit?: string;
  // Live stock at the time of export from ERP
  currentStock?: number;
  minStock?: number;
  maxStock?: number;
  // Opening stock at the start of the financial year/period (for reporting)
  openingStockQty?: number;
  openingStockValue?: number;
  sellingPrice?: number;
  purchasePrice?: number;
  mrp?: number;
  gstRate?: number;
  hsnCode?: string;
  location?: string;
  brand?: string;
  barcode?: string;
  // Supplier information fields
  supplierName?: string;
  supplierCompany?: string;
  supplierContact?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  supplierGSTIN?: string;
  supplierPAN?: string;
  supplierAddress?: string;
}

export interface ERPSupplier {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  pan?: string;
  city?: string;
  state?: string;
  pincode?: string;
  bankAccount?: string;
  ifscCode?: string;
  creditLimit?: number;
  paymentTerms?: string;
}

export interface ERPParseResult {
  success: boolean;
  data: ERPProduct[] | ERPSupplier[];
  errors: Array<{ row: number; error: string; data?: any }>;
  warnings: Array<{ row: number; warnings: string[] }>;
  summary: {
    totalRows: number;
    processed: number;
    skipped: number;
  };
}

// Field mappings for different ERP systems
const PRODUCT_FIELD_MAPPINGS = {
  // Product identification
  name: ['Item Name', 'Product Name', 'Name', 'Description', 'Item', 'Stock Item'],
  sku: ['SKU', 'Item Code', 'Product Code', 'Code', 'Part Number', 'Item No'],
  description: ['Description', 'Details', 'Product Description', 'Long Description'],
  category: ['Category', 'Group', 'Item Group', 'Product Group', 'Class', 'Type'],
  
  // Units and stock
  unit: ['Unit', 'UOM', 'Unit of Measure', 'Primary Unit', 'Base Unit'],
  openingStockQty: ['Opening Stock Qty', 'Opening Stock Quantity', 'Opening Qty', 'Opening Balance Qty'],
  openingStockValue: ['Opening Stock Value', 'Opening Value', 'Opening Stock Amount'],
  currentStock: ['Current Stock', 'Stock', 'Quantity', 'Qty', 'Balance', 'Available Stock', 'On Hand'],
  minStock: ['Min Stock', 'Minimum Stock', 'Min Level', 'Reorder Level', 'ROL'],
  maxStock: ['Max Stock', 'Maximum Stock', 'Max Level'],
  
  // Pricing
  sellingPrice: ['Selling Price', 'Sale Rate', 'Rate', 'Price', 'SP', 'Sales Price'],
  purchasePrice: ['Purchase Price', 'Cost Price', 'CP', 'Buy Rate', 'Purchase Rate'],
  mrp: ['MRP', 'Maximum Retail Price', 'List Price', 'RRP'],
  
  // Tax and compliance
  gstRate: ['GST Rate', 'GST%', 'GST', 'Tax Rate', 'VAT Rate', 'Tax%'],
  hsnCode: ['HSN Code', 'HSN', 'HSN/SAC', 'SAC Code', 'Commodity Code'],
  
  // Additional info
  location: ['Location', 'Warehouse', 'Godown', 'Store'],
  brand: ['Brand', 'Make', 'Manufacturer'],
  barcode: ['Barcode', 'EAN', 'UPC', 'Barcode No'],
  
  // Supplier information
  supplierName: ['Supplier Name', 'Supplier', 'Vendor Name', 'Vendor'],
  supplierCompany: ['Supplier Company', 'Supplier Company Name', 'Vendor Company'],
  supplierContact: ['Supplier Contact', 'Supplier Contact Person', 'Vendor Contact'],
  supplierPhone: ['Supplier Phone', 'Supplier Mobile', 'Supplier Contact No', 'Vendor Phone'],
  supplierEmail: ['Supplier Email', 'Supplier Email ID', 'Vendor Email'],
  supplierGSTIN: ['Supplier GSTIN', 'Supplier GST No', 'Supplier GST Number', 'Vendor GSTIN'],
  supplierPAN: ['Supplier PAN', 'Supplier PAN No', 'Vendor PAN'],
  supplierAddress: ['Supplier Address', 'Supplier Full Address', 'Vendor Address']
};

const SUPPLIER_FIELD_MAPPINGS = {
  // Basic info
  name: ['Company Name', 'Supplier Name', 'Vendor Name', 'Name', 'Business Name'],
  contactPerson: ['Contact Person', 'Contact Name', 'Representative', 'Person Name'],
  
  // Contact details
  phone: ['Phone', 'Mobile', 'Contact No', 'Phone Number', 'Mobile No'],
  email: ['Email', 'Email ID', 'Email Address', 'Contact Email'],
  address: ['Address', 'Full Address', 'Complete Address', 'Street Address'],
  
  // Location
  city: ['City', 'Town'],
  state: ['State', 'Province'],
  pincode: ['Pincode', 'PIN', 'Postal Code', 'ZIP Code'],
  
  // Tax details
  gstin: ['GSTIN', 'GST No', 'GST Number', 'Tax ID'],
  pan: ['PAN', 'PAN No', 'PAN Number'],
  
  // Banking
  bankAccount: ['Bank Account', 'Account No', 'Account Number', 'Bank Account No'],
  ifscCode: ['IFSC Code', 'IFSC', 'Bank Code'],
  
  // Business terms
  creditLimit: ['Credit Limit', 'Credit Amount', 'Max Credit'],
  paymentTerms: ['Payment Terms', 'Terms', 'Credit Terms', 'Payment Condition']
};

export function findColumnMapping(headers: string[], type: 'products' | 'suppliers'): Record<string, number> {
  const mapping: Record<string, number> = {};
  const fieldMappings = type === 'products' ? PRODUCT_FIELD_MAPPINGS : SUPPLIER_FIELD_MAPPINGS;
  
  // Normalize headers for comparison
  const normalizedHeaders = headers.map(h => h.trim().toLowerCase());
  
  Object.entries(fieldMappings).forEach(([field, possibleNames]) => {
    for (const name of possibleNames) {
      const normalizedName = name.toLowerCase();
      const index = normalizedHeaders.findIndex(h => 
        h === normalizedName || 
        h.includes(normalizedName) || 
        normalizedName.includes(h) ||
        // Handle common variations
        h.replace(/[^a-z0-9]/g, '') === normalizedName.replace(/[^a-z0-9]/g, '')
      );
      
      if (index !== -1) {
        mapping[field] = index;
        break;
      }
    }
  });
  
  return mapping;
}

export function parseERPData(csvContent: string, type: 'products' | 'suppliers'): ERPParseResult {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const errors: Array<{ row: number; error: string; data?: any }> = [];
  const warnings: Array<{ row: number; warnings: string[] }> = [];
  const data: (ERPProduct | ERPSupplier)[] = [];
  
  if (lines.length < 2) {
    return {
      success: false,
      data: [],
      errors: [{ row: 0, error: 'File must contain headers and at least one data row' }],
      warnings: [],
      summary: { totalRows: 0, processed: 0, skipped: 0 }
    };
  }
  
  // Parse headers
  const headers = parseCSVLine(lines[0]);
  const columnMapping = findColumnMapping(headers, type);
  
  // Check for essential fields
  const essentialFields = type === 'products' ? ['name'] : ['name'];
  const missingFields = essentialFields.filter(field => !(field in columnMapping));
  
  if (missingFields.length > 0) {
    errors.push({
      row: 0,
      error: `Missing essential columns: ${missingFields.join(', ')}. Please ensure your CSV contains required fields.`
    });
  }
  
  let processed = 0;
  let skipped = 0;
  
  // Process data rows
  for (let i = 1; i < lines.length; i++) {
    try {
      const row = parseCSVLine(lines[i]);
      const rowWarnings: string[] = [];
      
      if (row.length < Math.max(...Object.values(columnMapping)) + 1) {
        skipped++;
        errors.push({ row: i + 1, error: 'Insufficient columns in row' });
        continue;
      }
      
      const item: Partial<ERPProduct | ERPSupplier> = {};
      
      // Map all available fields
      Object.entries(columnMapping).forEach(([field, colIndex]) => {
        const value = row[colIndex]?.trim();
        if (!value) return;
        
        try {
          if (type === 'products') {
            mapProductField(item as Partial<ERPProduct>, field, value, rowWarnings);
          } else {
            mapSupplierField(item as Partial<ERPSupplier>, field, value, rowWarnings);
          }
        } catch (error) {
          rowWarnings.push(`Error parsing ${field}: ${value}`);
        }
      });
      
      // Validation
      if (!item.name) {
        skipped++;
        errors.push({ row: i + 1, error: 'Missing name field' });
        continue;
      }
      
      // Set defaults for products
      if (type === 'products') {
        const product = item as Partial<ERPProduct>;
        product.unit = product.unit || 'Nos';
        product.currentStock = product.currentStock || 0;
        product.gstRate = product.gstRate || 18;
        
        // Auto-detect GST rate from HSN if available
        if (product.hsnCode && !product.gstRate) {
          const autoGST = getGSTRateFromHSN(product.hsnCode);
          if (autoGST) {
            product.gstRate = autoGST;
            rowWarnings.push(`Auto-detected GST rate ${autoGST}% from HSN code`);
          }
        }
      }
      
      data.push(item as ERPProduct | ERPSupplier);
      processed++;
      
      if (rowWarnings.length > 0) {
        warnings.push({ row: i + 1, warnings: rowWarnings });
      }
      
    } catch (error) {
      skipped++;
      errors.push({ 
        row: i + 1, 
        error: `Error processing row: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
    }
  }
  
  return {
    success: data.length > 0,
    data,
    errors,
    warnings,
    summary: {
      totalRows: lines.length - 1,
      processed,
      skipped
    }
  };
}

function mapProductField(product: Partial<ERPProduct>, field: string, value: string, warnings: string[]) {
  switch (field) {
    case 'name':
    case 'sku':
    case 'description':
    case 'category':
    case 'unit':
    case 'hsnCode':
    case 'location':
    case 'brand':
    case 'barcode':
    case 'supplierName':
    case 'supplierCompany':
    case 'supplierContact':
    case 'supplierPhone':
    case 'supplierEmail':
    case 'supplierGSTIN':
    case 'supplierPAN':
    case 'supplierAddress':
      (product as any)[field] = value;
      break;

    case 'openingStockQty':
    case 'currentStock':
    case 'minStock':
    case 'maxStock': {
      const qty = parseFloat(value.replace(/[^0-9.-]/g, ''));
      if (!isNaN(qty) && qty >= 0) {
        (product as any)[field] = qty;
      } else {
        warnings.push(`Invalid quantity for ${field}: ${value}`);
      }
      break;
    }

    case 'openingStockValue':
    case 'sellingPrice':
    case 'purchasePrice':
    case 'mrp':
      const price = parseFloat(value.replace(/[^0-9.-]/g, ''));
      if (!isNaN(price) && price >= 0) {
        (product as any)[field] = price;
      } else {
        warnings.push(`Invalid price for ${field}: ${value}`);
      }
      break;
      
    case 'gstRate':
      const rate = parseFloat(value.replace(/[^0-9.-]/g, ''));
      if (!isNaN(rate) && rate >= 0 && rate <= 100) {
        (product as any)[field] = rate;
      } else {
        warnings.push(`Invalid GST rate: ${value}`);
      }
      break;
  }
}

function mapSupplierField(supplier: Partial<ERPSupplier>, field: string, value: string, warnings: string[]) {
  switch (field) {
    case 'name':
    case 'contactPerson':
    case 'phone':
    case 'email':
    case 'address':
    case 'gstin':
    case 'pan':
    case 'city':
    case 'state':
    case 'pincode':
    case 'bankAccount':
    case 'ifscCode':
    case 'paymentTerms':
      (supplier as any)[field] = value;
      break;
      
    case 'creditLimit':
      const limit = parseFloat(value.replace(/[^0-9.-]/g, ''));
      if (!isNaN(limit) && limit >= 0) {
        supplier.creditLimit = limit;
      } else {
        warnings.push(`Invalid credit limit: ${value}`);
      }
      break;
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result.map(field => field.replace(/^"|"$/g, '').trim());
}

// HSN code to GST rate mapping (common rates)
function getGSTRateFromHSN(hsnCode: string): number | null {
  const hsn = hsnCode.replace(/[^0-9]/g, '');
  
  const gstMapping: Record<string, number> = {
    // Food items (5%)
    '1001': 5, '1002': 5, '1003': 5, '1004': 5, // Cereals
    '0401': 5, '0402': 5, '0403': 5, '0404': 5, // Dairy
    '1701': 5, // Sugar
    '1507': 5, '1508': 5, '1509': 5, // Cooking oils
    
    // Medicines (5% or 12%)
    '3003': 5, '3004': 5,
    
    // Textiles (5% or 12%)
    '5201': 5, '5202': 5, // Cotton
    '6001': 12, '6002': 12, // Knitted fabrics
    
    // Construction materials (18% or 28%)
    '7213': 18, // Steel bars
    '2523': 28, // Cement
    
    // Electronics (18%)
    '8517': 18, // Mobile phones
    '8528': 18, // TV, monitors
    '8471': 18, // Computers
    
    // Automobiles (28%)
    '8703': 28, // Cars
    '8711': 28, // Motorcycles
  };
  
  // Try exact match first
  if (gstMapping[hsn]) {
    return gstMapping[hsn];
  }
  
  // Try partial matches (first 4 digits)
  const shortHsn = hsn.substring(0, 4);
  if (gstMapping[shortHsn]) {
    return gstMapping[shortHsn];
  }
  
  return null;
}

export function generateSampleCSV(type: 'products' | 'suppliers'): string {
  if (type === 'products') {
    const headers = [
      'Item Name',
      'SKU',
      'Description',
      'Category',
      'Unit',
      'Opening Stock Qty',
      'Opening Stock Value',
      'Current Stock',
      'Min Stock',
      'Selling Price',
      'Purchase Price',
      'GST Rate',
      'HSN Code',
      'Supplier Name',
      'Supplier Company',
      'Supplier Contact',
      'Supplier Phone',
      'Supplier Email',
      'Supplier GSTIN',
      'Supplier PAN',
      'Supplier Address'
    ];
    
    const sampleData = [
      [
        'Steel Rod 12mm',
        'SR-12-001',
        'TMT Bar 12mm Fe500D',
        'Construction Materials',
        'Kg',
        '500',
        '30000',
        '1000',
        '100',
        '65.50',
        '60.00',
        '18',
        '7213',
        'Rajesh Kumar',
        'ABC Steel Suppliers',
        'Rajesh Kumar',
        '+91-9876543210',
        'rajesh@abcsteel.com',
        '06ABCDE1234F1Z5',
        'ABCDE1234F',
        '123 Industrial Area, Sector 15, Gurgaon, Haryana'
      ],
      [
        'Cement OPC 53 Grade',
        'CEM-OPC53',
        'Ordinary Portland Cement 53 Grade',
        'Construction Materials',
        'Bag',
        '200',
        '80000',
        '500',
        '50',
        '420.00',
        '400.00',
        '28',
        '2523',
        'Amit Patel',
        'Quality Cement Works',
        'Amit Patel',
        '+91-9876543212',
        'amit@qualitycement.com',
        '24KLMNO9012P3Q7',
        'KLMNO9012P',
        '789 Factory Road, GIDC, Ahmedabad, Gujarat'
      ],
      [
        'Mobile Phone',
        'MOB-001',
        'Smartphone with 128GB storage',
        'Electronics',
        'Nos',
        '10',
        '120000',
        '25',
        '5',
        '15000.00',
        '12000.00',
        '18',
        '8517',
        'Priya Sharma',
        'Modern Electronics Ltd',
        'Priya Sharma',
        '+91-9876543211',
        'priya@modernelectronics.com',
        '29FGHIJ5678K2L9',
        'FGHIJ5678K',
        '456 Tech Park, Phase 2, Bangalore, Karnataka'
      ]
    ];
    
    return [headers, ...sampleData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  } else {
    const headers = [
      'Company Name',
      'Contact Person',
      'Phone',
      'Email',
      'Address',
      'City',
      'State',
      'Pincode',
      'GSTIN',
      'PAN'
    ];
    
    const sampleData = [
      [
        'ABC Steel Suppliers',
        'Rajesh Kumar',
        '+91-9876543210',
        'rajesh@abcsteel.com',
        '123 Industrial Area, Sector 15',
        'Gurgaon',
        'Haryana',
        '122001',
        '06ABCDE1234F1Z5',
        'ABCDE1234F'
      ],
      [
        'Modern Electronics Ltd',
        'Priya Sharma',
        '+91-9876543211',
        'priya@modernelectronics.com',
        '456 Tech Park, Phase 2',
        'Bangalore',
        'Karnataka',
        '560001',
        '29FGHIJ5678K2L9',
        'FGHIJ5678K'
      ],
      [
        'Quality Cement Works',
        'Amit Patel',
        '+91-9876543212',
        'amit@qualitycement.com',
        '789 Factory Road, GIDC',
        'Ahmedabad',
        'Gujarat',
        '380001',
        '24KLMNO9012P3Q7',
        'KLMNO9012P'
      ]
    ];
    
    return [headers, ...sampleData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }
}