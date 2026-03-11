// Indian business utilities and formatting

export interface GSTCalculation {
  baseAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess?: number;
  totalTax: number;
  totalAmount: number;
  gstRate: number;
  cessRate?: number;
  isInterState: boolean;
}

export interface HSNInfo {
  code: string;
  description: string;
  gstRate: number;
  cessRate?: number;
  exempted?: boolean;
}

// Common Indian business units
export const INDIAN_UNITS = [
  'Nos', 'Pcs', 'Kg', 'Gms', 'Ltr', 'Mtr', 'Sq.Mtr', 'Cu.Mtr',
  'Dozen', 'Gross', 'Quintal', 'Tonne', 'Box', 'Packet', 'Bundle',
  'Set', 'Pair', 'Roll', 'Sheet', 'Bottle', 'Bag', 'Carton'
];

// Indian states for GST calculation
export const INDIAN_STATES = [
  { code: 'AN', name: 'Andaman and Nicobar Islands', stateCode: '35' },
  { code: 'AP', name: 'Andhra Pradesh', stateCode: '28' },
  { code: 'AR', name: 'Arunachal Pradesh', stateCode: '12' },
  { code: 'AS', name: 'Assam', stateCode: '18' },
  { code: 'BR', name: 'Bihar', stateCode: '10' },
  { code: 'CH', name: 'Chandigarh', stateCode: '04' },
  { code: 'CG', name: 'Chhattisgarh', stateCode: '22' },
  { code: 'DH', name: 'Dadra and Nagar Haveli', stateCode: '26' },
  { code: 'DD', name: 'Daman and Diu', stateCode: '25' },
  { code: 'DL', name: 'Delhi', stateCode: '07' },
  { code: 'GA', name: 'Goa', stateCode: '30' },
  { code: 'GJ', name: 'Gujarat', stateCode: '24' },
  { code: 'HR', name: 'Haryana', stateCode: '06' },
  { code: 'HP', name: 'Himachal Pradesh', stateCode: '02' },
  { code: 'JK', name: 'Jammu and Kashmir', stateCode: '01' },
  { code: 'JH', name: 'Jharkhand', stateCode: '20' },
  { code: 'KA', name: 'Karnataka', stateCode: '29' },
  { code: 'KL', name: 'Kerala', stateCode: '32' },
  { code: 'LD', name: 'Lakshadweep', stateCode: '31' },
  { code: 'MP', name: 'Madhya Pradesh', stateCode: '23' },
  { code: 'MH', name: 'Maharashtra', stateCode: '27' },
  { code: 'MN', name: 'Manipur', stateCode: '14' },
  { code: 'ML', name: 'Meghalaya', stateCode: '17' },
  { code: 'MZ', name: 'Mizoram', stateCode: '15' },
  { code: 'NL', name: 'Nagaland', stateCode: '13' },
  { code: 'OR', name: 'Odisha', stateCode: '21' },
  { code: 'PY', name: 'Puducherry', stateCode: '34' },
  { code: 'PB', name: 'Punjab', stateCode: '03' },
  { code: 'RJ', name: 'Rajasthan', stateCode: '08' },
  { code: 'SK', name: 'Sikkim', stateCode: '11' },
  { code: 'TN', name: 'Tamil Nadu', stateCode: '33' },
  { code: 'TS', name: 'Telangana', stateCode: '36' },
  { code: 'TR', name: 'Tripura', stateCode: '16' },
  { code: 'UP', name: 'Uttar Pradesh', stateCode: '09' },
  { code: 'UK', name: 'Uttarakhand', stateCode: '05' },
  { code: 'WB', name: 'West Bengal', stateCode: '19' }
];

// Common HSN codes for Indian businesses - Updated 2025 rates
export const COMMON_HSN_CODES: HSNInfo[] = [
  // Food & Agriculture (Updated rates)
  { code: '1001', description: 'Wheat', gstRate: 5 },
  { code: '1006', description: 'Rice', gstRate: 5 },
  { code: '0401', description: 'Milk and cream', gstRate: 5 },
  { code: '1701', description: 'Cane or beet sugar', gstRate: 5 },
  { code: '1511', description: 'Palm oil', gstRate: 5 },
  { code: '0713', description: 'Dried leguminous vegetables (pulses)', gstRate: 5 },
  
  // Textiles (Updated rates for 2025)
  { code: '5201', description: 'Cotton, not carded or combed', gstRate: 5 },
  { code: '6109', description: 'T-shirts, singlets and other vests', gstRate: 12 },
  { code: '6203', description: 'Men\'s suits, ensembles, jackets', gstRate: 12 },
  { code: '6302', description: 'Bed linen, table linen, toilet linen', gstRate: 5 },
  { code: '5208', description: 'Woven fabrics of cotton', gstRate: 5 },
  
  // Electronics (Updated for 2025)
  { code: '8517', description: 'Mobile phones and accessories', gstRate: 18 },
  { code: '8528', description: 'TV receivers, monitors', gstRate: 18 },
  { code: '8471', description: 'Automatic data processing machines', gstRate: 18 },
  { code: '8504', description: 'Electrical transformers', gstRate: 18 },
  { code: '8544', description: 'Insulated wire, cable', gstRate: 18 },
  
  // Automobiles (Luxury tax increase)
  { code: '8703', description: 'Motor cars (above 1500cc)', gstRate: 43, cessRate: 15 },
  { code: '8702', description: 'Motor cars (up to 1500cc)', gstRate: 28 },
  { code: '8711', description: 'Motorcycles (above 350cc)', gstRate: 28, cessRate: 3 },
  { code: '8712', description: 'Bicycles and cycle rickshaws', gstRate: 12 },
  
  // Medicines and Healthcare
  { code: '3004', description: 'Medicaments (life-saving drugs)', gstRate: 5 },
  { code: '3003', description: 'Medicaments (other)', gstRate: 12 },
  { code: '9018', description: 'Medical instruments', gstRate: 12 },
  
  // Construction materials (Updated)
  { code: '2523', description: 'Cement', gstRate: 28 },
  { code: '7308', description: 'Structures of iron or steel', gstRate: 18 },
  { code: '6810', description: 'Articles of cement, concrete', gstRate: 28 },
  { code: '2501', description: 'Salt', gstRate: 5 },
  
  // FMCG and Consumer goods
  { code: '3401', description: 'Soap, organic detergents', gstRate: 18 },
  { code: '2202', description: 'Aerated beverages', gstRate: 28, cessRate: 12 },
  { code: '2208', description: 'Alcoholic beverages', gstRate: 28, cessRate: 8 },
  { code: '2401', description: 'Tobacco products', gstRate: 28, cessRate: 4 },
  
  // Services (SAC codes) - Updated
  { code: '998314', description: 'Transportation of goods by road', gstRate: 5 },
  { code: '997212', description: 'Advertising services', gstRate: 18 },
  { code: '998313', description: 'Transportation of passengers by air', gstRate: 5 },
  { code: '997321', description: 'Management consultancy services', gstRate: 18 },
  { code: '998361', description: 'Telecommunications services', gstRate: 18 }
];

export function formatIndianCurrency(amount: number, showSymbol: boolean = true): string {
  const formatter = new Intl.NumberFormat('en-IN', {
    style: showSymbol ? 'currency' : 'decimal',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  if (showSymbol) {
    return formatter.format(amount);
  } else {
    const formatted = formatter.format(amount);
    return formatted.replace(/[₹,]/g, '').trim();
  }
}

export function calculateGST(
  baseAmount: number,
  gstRate: number,
  cessRate: number = 0,
  fromState: string = '',
  toState: string = ''
): GSTCalculation {
  const isInterState = fromState !== toState && Boolean(fromState) && Boolean(toState);
  
  const gstAmount = (baseAmount * gstRate) / 100;
  const cessAmount = cessRate > 0 ? (baseAmount * cessRate) / 100 : 0;
  
  let cgst = 0, sgst = 0, igst = 0;
  
  if (isInterState) {
    // Inter-state transaction - IGST
    igst = gstAmount;
  } else {
    // Intra-state transaction - CGST + SGST
    cgst = gstAmount / 2;
    sgst = gstAmount / 2;
  }
  
  const totalTax = gstAmount + cessAmount;
  const totalAmount = baseAmount + totalTax;
  
  return {
    baseAmount,
    cgst: Math.round(cgst * 100) / 100,
    sgst: Math.round(sgst * 100) / 100,
    igst: Math.round(igst * 100) / 100,
    cess: cessAmount > 0 ? Math.round(cessAmount * 100) / 100 : undefined,
    totalTax: Math.round(totalTax * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
    gstRate,
    cessRate: cessRate > 0 ? cessRate : undefined,
    isInterState
  };
}

export function validateGSTIN(gstin: string): boolean {
  // GSTIN format: 15 characters
  // First 2: State code
  // Next 10: PAN
  // Next 1: Registration type (1-9, A-Z except I and O)
  // Next 1: Default 'Z'
  // Last 1: Check digit
  
  if (!gstin || gstin.length !== 15) return false;
  
  const gstinRegex = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  return gstinRegex.test(gstin.toUpperCase());
}

export function validatePAN(pan: string): boolean {
  if (!pan || pan.length !== 10) return false;
  
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  return panRegex.test(pan.toUpperCase());
}

export function getStateFromGSTIN(gstin: string): string | null {
  if (!validateGSTIN(gstin)) return null;
  
  const stateCode = gstin.substring(0, 2);
  const state = INDIAN_STATES.find(s => s.stateCode === stateCode);
  return state ? state.name : null;
}

export function formatIndianNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num);
}

export function parseIndianNumber(str: string): number {
  // Remove commas and other non-digit characters except decimal point
  const cleaned = str.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

// Convert number to Indian words
export function numberToIndianWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  if (num === 0) return 'Zero';
  
  function convertHundreds(n: number): string {
    let result = '';
    
    if (n >= 100) {
      result += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    
    if (n >= 20) {
      result += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    } else if (n >= 10) {
      result += teens[n - 10] + ' ';
      return result;
    }
    
    if (n > 0) {
      result += ones[n] + ' ';
    }
    
    return result;
  }
  
  if (num < 0) return 'Minus ' + numberToIndianWords(-num);
  
  // Handle decimal part
  const parts = num.toString().split('.');
  let integerPart = parseInt(parts[0]);
  let result = '';
  
  if (integerPart >= 10000000) { // Crore
    result += convertHundreds(Math.floor(integerPart / 10000000)) + 'Crore ';
    integerPart %= 10000000;
  }
  
  if (integerPart >= 100000) { // Lakh
    result += convertHundreds(Math.floor(integerPart / 100000)) + 'Lakh ';
    integerPart %= 100000;
  }
  
  if (integerPart >= 1000) { // Thousand
    result += convertHundreds(Math.floor(integerPart / 1000)) + 'Thousand ';
    integerPart %= 1000;
  }
  
  if (integerPart > 0) {
    result += convertHundreds(integerPart);
  }
  
  // Handle paise (decimal part)
  if (parts[1]) {
    const decimal = parseInt(parts[1].substring(0, 2).padEnd(2, '0'));
    if (decimal > 0) {
      result += 'and ' + convertHundreds(decimal) + 'Paise ';
    }
  } else {
    result += 'Only ';
  }
  
  return result.trim();
}

// Financial year utilities
export function getCurrentFinancialYear(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based
  
  let startYear, endYear;
  
  if (currentMonth >= 3) { // April onwards
    startYear = currentYear;
    endYear = currentYear + 1;
  } else { // January to March
    startYear = currentYear - 1;
    endYear = currentYear;
  }
  
  return {
    start: new Date(startYear, 3, 1), // April 1
    end: new Date(endYear, 2, 31), // March 31
    label: `FY ${startYear}-${endYear.toString().slice(-2)}`
  };
}

export function getFinancialYearForDate(date: Date): { start: Date; end: Date; label: string } {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based

  const startYear = month >= 3 ? year : year - 1; // FY starts April 1
  const endYear = startYear + 1;

  return {
    start: new Date(startYear, 3, 1),
    end: new Date(endYear, 2, 31),
    label: `FY ${startYear}-${endYear.toString().slice(-2)}`,
  };
}

export function getQuarterFromDate(date: Date): { quarter: number; fy: string } {
  const fy = getCurrentFinancialYear();
  const month = date.getMonth(); // 0-based
  
  let quarter;
  if (month >= 3 && month <= 5) quarter = 1; // Apr-Jun
  else if (month >= 6 && month <= 8) quarter = 2; // Jul-Sep
  else if (month >= 9 && month <= 11) quarter = 3; // Oct-Dec
  else quarter = 4; // Jan-Mar
  
  return { quarter, fy: fy.label };
}