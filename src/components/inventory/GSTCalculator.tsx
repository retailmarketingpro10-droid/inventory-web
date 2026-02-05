import React, { useState, useEffect } from "react";
import { Calculator, IndianRupee, FileText, Copy, Check } from "lucide-react";
import { 
  calculateGST, 
  formatIndianCurrency, 
  numberToIndianWords,
  INDIAN_STATES,
  COMMON_HSN_CODES,
  validateGSTIN,
  type GSTCalculation 
} from "@/utils/indianBusiness";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

export function GSTCalculator() {
  const [amount, setAmount] = useState<string>("");
  const [gstRate, setGstRate] = useState<string>("18");
  const [cessRate, setCessRate] = useState<string>("0");
  const [fromState, setFromState] = useState<string>("");
  const [toState, setToState] = useState<string>("");
  const [hsnCode, setHsnCode] = useState<string>("");
  const [calculation, setCalculation] = useState<GSTCalculation | null>(null);
  const [copied, setCopied] = useState<string>("");
  const [includesTax, setIncludesTax] = useState<boolean>(false);

  useEffect(() => {
    if (amount && gstRate) {
      const baseAmount = parseFloat(amount);
      const rate = parseFloat(gstRate);
      const cess = parseFloat(cessRate) || 0;
      
      if (!isNaN(baseAmount) && !isNaN(rate)) {
        let actualBaseAmount = baseAmount;
        
        // If amount includes tax, calculate base amount first
        if (includesTax) {
          actualBaseAmount = baseAmount / (1 + (rate + cess) / 100);
        }
        
        const calc = calculateGST(actualBaseAmount, rate, cess, fromState, toState);
        setCalculation(calc);
      }
    } else {
      setCalculation(null);
    }
  }, [amount, gstRate, cessRate, fromState, toState, includesTax]);

  const handleHSNChange = (hsn: string) => {
    setHsnCode(hsn);
    const hsnInfo = COMMON_HSN_CODES.find(h => h.code === hsn);
    if (hsnInfo) {
      setGstRate(hsnInfo.gstRate.toString());
      if (hsnInfo.cessRate) {
        setCessRate(hsnInfo.cessRate.toString());
      }
    }
  };

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(""), 2000);
    } catch (err) {
      logger.error('Failed to copy: ', err);
    }
  };

  const generateInvoiceText = () => {
    if (!calculation) return "";
    
    return `
Invoice Calculation:
Base Amount: ${formatIndianCurrency(calculation.baseAmount)}
${calculation.isInterState ? 
  `IGST (${calculation.gstRate}%): ${formatIndianCurrency(calculation.igst)}` :
  `CGST (${calculation.gstRate/2}%): ${formatIndianCurrency(calculation.cgst)}
SGST (${calculation.gstRate/2}%): ${formatIndianCurrency(calculation.sgst)}`
}${calculation.cess ? `\nCess (${calculation.cessRate}%): ${formatIndianCurrency(calculation.cess)}` : ""}
Total Tax: ${formatIndianCurrency(calculation.totalTax)}
Total Amount: ${formatIndianCurrency(calculation.totalAmount)}

Amount in Words: ${numberToIndianWords(calculation.totalAmount)} Rupees Only
    `.trim();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Calculator className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-foreground">GST Calculator</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="bg-card rounded-lg shadow-sm p-6 border border-border space-y-4">
          <h3 className="text-lg font-semibold text-card-foreground mb-4">Calculation Inputs</h3>
          
          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              Amount {includesTax ? "(Including Tax)" : "(Excluding Tax)"}
            </label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full pl-10 pr-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="includesTax"
                checked={includesTax}
                onChange={(e) => setIncludesTax(e.target.checked)}
                className="rounded border-input"
              />
              <label htmlFor="includesTax" className="text-sm text-muted-foreground">
                Amount includes tax
              </label>
            </div>
          </div>

          {/* HSN Code */}
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-2">
              HSN/SAC Code (Optional)
            </label>
            <select
              value={hsnCode}
              onChange={(e) => handleHSNChange(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Select HSN Code</option>
              {COMMON_HSN_CODES.map((hsn) => (
                <option key={hsn.code} value={hsn.code}>
                  {hsn.code} - {hsn.description} ({hsn.gstRate}%)
                </option>
              ))}
            </select>
          </div>

          {/* GST Rate */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                GST Rate (%)
              </label>
              <select
                value={gstRate}
                onChange={(e) => setGstRate(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="0">0% (Exempt)</option>
                <option value="5">5% (Essential goods)</option>
                <option value="12">12% (Processed foods, some textiles)</option>
                <option value="18">18% (Most goods & services)</option>
                <option value="28">28% (Luxury goods)</option>
                <option value="43">43% (Ultra-luxury cars with cess)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                Cess Rate (%)
              </label>
              <input
                type="number"
                value={cessRate}
                onChange={(e) => setCessRate(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          {/* State Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                From State
              </label>
              <select
                value={fromState}
                onChange={(e) => setFromState(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Select State</option>
                {INDIAN_STATES.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-card-foreground mb-2">
                To State
              </label>
              <select
                value={toState}
                onChange={(e) => setToState(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Select State</option>
                {INDIAN_STATES.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {fromState && toState && (
            <div className={cn(
              "p-3 rounded-md text-sm",
              calculation?.isInterState 
                ? "bg-info/10 text-info border border-info/20" 
                : "bg-success/10 text-success border border-success/20"
            )}>
              {calculation?.isInterState ? "Inter-state transaction (IGST applicable)" : "Intra-state transaction (CGST + SGST applicable)"}
            </div>
          )}
        </div>

        {/* Result Section */}
        <div className="bg-card rounded-lg shadow-sm p-6 border border-border">
          <h3 className="text-lg font-semibold text-card-foreground mb-4">Calculation Result</h3>
          
          {calculation ? (
            <div className="space-y-4">
              {/* Base Amount */}
              <div className="flex justify-between items-center py-2">
                <span className="text-muted-foreground">Base Amount:</span>
                <span className="font-semibold text-foreground">
                  {formatIndianCurrency(calculation.baseAmount)}
                </span>
              </div>

              <div className="border-t border-border pt-2">
                {calculation.isInterState ? (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">IGST ({calculation.gstRate}%):</span>
                    <span className="font-medium text-foreground">
                      {formatIndianCurrency(calculation.igst)}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-muted-foreground">CGST ({calculation.gstRate/2}%):</span>
                      <span className="font-medium text-foreground">
                        {formatIndianCurrency(calculation.cgst)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-muted-foreground">SGST ({calculation.gstRate/2}%):</span>
                      <span className="font-medium text-foreground">
                        {formatIndianCurrency(calculation.sgst)}
                      </span>
                    </div>
                  </>
                )}

                {calculation.cess && calculation.cess > 0 && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Cess ({calculation.cessRate}%):</span>
                    <span className="font-medium text-foreground">
                      {formatIndianCurrency(calculation.cess)}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-2">
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Total Tax:</span>
                  <span className="font-semibold text-warning">
                    {formatIndianCurrency(calculation.totalTax)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 text-lg">
                  <span className="font-semibold text-card-foreground">Total Amount:</span>
                  <span className="font-bold text-primary">
                    {formatIndianCurrency(calculation.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Amount in Words */}
              <div className="bg-muted/50 rounded-md p-3 mt-4">
                <p className="text-sm text-muted-foreground mb-1">Amount in Words:</p>
                <p className="text-sm font-medium text-foreground">
                  {numberToIndianWords(calculation.totalAmount)} Rupees Only
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => copyToClipboard(calculation.totalAmount.toString(), 'amount')}
                  className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  {copied === 'amount' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  Copy Amount
                </button>
                <button
                  onClick={() => copyToClipboard(generateInvoiceText(), 'invoice')}
                  className="flex-1 bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:bg-secondary/90 transition-colors flex items-center justify-center gap-2"
                >
                  {copied === 'invoice' ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  Copy Details
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calculator className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p>Enter amount and GST rate to calculate</p>
            </div>
          )}
        </div>
      </div>

      {/* GST Rate Guide - Updated 2025 */}
      <div className="bg-card rounded-lg shadow-sm p-6 border border-border">
        <h3 className="text-lg font-semibold text-card-foreground mb-4">GST Rate Guide (Updated 2025)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-success/10 border border-success/20 rounded-md p-3">
            <h4 className="font-semibold text-success mb-2">5% GST</h4>
            <p className="text-sm text-success/90">Essential items: Food grains, medicines, milk, textiles, books</p>
          </div>
          <div className="bg-info/10 border border-info/20 rounded-md p-3">
            <h4 className="font-semibold text-info mb-2">12% GST</h4>
            <p className="text-sm text-info/90">Processed foods, apparel below ₹1000, bicycles, medical equipment</p>
          </div>
          <div className="bg-warning/10 border border-warning/20 rounded-md p-3">
            <h4 className="font-semibold text-warning mb-2">18% GST</h4>
            <p className="text-sm text-warning/90">Most goods & services, electronics, mobiles, steel</p>
          </div>
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
            <h4 className="font-semibold text-destructive mb-2">28% GST</h4>
            <p className="text-sm text-destructive/90">Luxury items, cars, motorcycles, cement, aerated drinks</p>
          </div>
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-md p-3">
            <h4 className="font-semibold text-purple-600 mb-2">28% + Cess</h4>
            <p className="text-sm text-purple-600/90">Ultra-luxury cars (43% total), tobacco, pan masala</p>
          </div>
        </div>
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-sm text-amber-800">
            <strong>2025 Update:</strong> New simplified structure with enhanced rates for luxury goods and reduced rates for essential items.
          </p>
        </div>
      </div>
    </div>
  );
}