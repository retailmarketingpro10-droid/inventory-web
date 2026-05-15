// GST Breakdown utilities for CGST, SGST, and IGST calculations
export interface GSTBreakdown {
  cgst: number;
  sgst: number;
  igst: number;
  totalGST: number;
  taxableAmount: number;
  totalAmount: number;
}

export interface GSTConfig {
  fromState: string;
  toState: string;
  isInterState: boolean;
}

// Indian states for GST calculation
export const INDIAN_STATES = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '25', name: 'Daman and Diu' },
  { code: '26', name: 'Dadra and Nagar Haveli' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' }
];

export function calculateGSTBreakdown(
  taxableAmount: number,
  gstRate: number,
  config: GSTConfig
): GSTBreakdown {
  // Use the isInterState flag from config (which respects forceIGST)
  // Don't recalculate from states, as forceIGST might override the state comparison
  const isInterState = config.isInterState !== undefined ? config.isInterState : (config.fromState !== config.toState && config.fromState && config.toState);
  const gstAmount = (taxableAmount * gstRate) / 100;
  
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  
  if (isInterState) {
    // Inter-state transaction - IGST applies
    // When IGST is selected, CGST and SGST must be 0
    igst = gstAmount;
    cgst = 0;
    sgst = 0;
  } else {
    // Intra-state transaction - CGST + SGST applies
    // When CGST/SGST applies, IGST must be 0
    cgst = gstAmount / 2;
    sgst = gstAmount / 2;
    igst = 0;
  }
  
  return {
    cgst: Math.round(cgst * 100) / 100,
    sgst: Math.round(sgst * 100) / 100,
    igst: Math.round(igst * 100) / 100,
    totalGST: Math.round(gstAmount * 100) / 100,
    taxableAmount: Math.round(taxableAmount * 100) / 100,
    totalAmount: Math.round((taxableAmount + gstAmount) * 100) / 100
  };
}

export function calculateLineItemGSTBreakdown(
  quantity: number,
  unitPrice: number,
  gstRate: number,
  config: GSTConfig
): GSTBreakdown {
  const taxableAmount = quantity * unitPrice;
  return calculateGSTBreakdown(taxableAmount, gstRate, config);
}

export function calculatePOGSTBreakdown(
  lineItems: Array<{
    quantity: number;
    unit_price: number;
    gst_rate: number;
  }>,
  config: GSTConfig
): GSTBreakdown {
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;
  let totalTaxableAmount = 0;
  
  lineItems.forEach(item => {
    const breakdown = calculateLineItemGSTBreakdown(
      item.quantity,
      item.unit_price,
      item.gst_rate,
      config
    );
    
    totalCGST += breakdown.cgst;
    totalSGST += breakdown.sgst;
    totalIGST += breakdown.igst;
    totalTaxableAmount += breakdown.taxableAmount;
  });
  
  return {
    cgst: Math.round(totalCGST * 100) / 100,
    sgst: Math.round(totalSGST * 100) / 100,
    igst: Math.round(totalIGST * 100) / 100,
    totalGST: Math.round((totalCGST + totalSGST + totalIGST) * 100) / 100,
    taxableAmount: Math.round(totalTaxableAmount * 100) / 100,
    totalAmount: Math.round((totalTaxableAmount + totalCGST + totalSGST + totalIGST) * 100) / 100
  };
}

export function getStateName(stateCode: string): string {
  const state = INDIAN_STATES.find(s => s.code === stateCode);
  return state ? state.name : 'Unknown State';
}

export function formatGSTBreakdown(breakdown: GSTBreakdown): string {
  const parts = [];
  if (breakdown.cgst > 0) parts.push(`CGST: ₹${breakdown.cgst.toFixed(2)}`);
  if (breakdown.sgst > 0) parts.push(`SGST: ₹${breakdown.sgst.toFixed(2)}`);
  if (breakdown.igst > 0) parts.push(`IGST: ₹${breakdown.igst.toFixed(2)}`);
  return parts.join(' | ');
}

