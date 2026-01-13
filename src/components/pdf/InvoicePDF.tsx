import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { formatIndianCurrency } from '@/utils/indianBusiness';

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  gst_rate: number;
  line_total: number;
}

interface Invoice {
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  discount_amount?: number;
  discount_percentage?: number;
  notes: string | null;
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

interface InvoicePDFProps {
  invoice: Invoice;
  items: InvoiceItem[];
  companyInfo?: {
    name: string;
    address: string;
    phone: string;
    email: string;
    gstin: string;
  };
  gstBreakdown?: {
    cgst: number;
    sgst: number;
    igst: number;
    total_gst: number;
  };
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 12,
    paddingTop: 35,
    paddingBottom: 65,
    paddingHorizontal: 35,
  },
  header: {
    marginBottom: 20,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  invoiceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  companyInfo: {
    width: '45%',
  },
  supplierInfo: {
    width: '45%',
  },
  label: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  text: {
    marginBottom: 3,
  },
  table: {
    marginTop: 20,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    paddingBottom: 5,
    marginBottom: 5,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
  },
  col1: { width: '40%', textAlign: 'left' },
  col2: { width: '10%', textAlign: 'center' },
  col3: { width: '15%', textAlign: 'right' },
  col4: { width: '10%', textAlign: 'center' },
  col5: { width: '25%', textAlign: 'right' },
  totalsSection: {
    marginTop: 20,
    alignItems: 'flex-end',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '40%',
    marginBottom: 5,
  },
  totalLabel: {
    fontWeight: 'bold',
  },
  grandTotal: {
    fontSize: 14,
    fontWeight: 'bold',
    borderTopWidth: 2,
    borderTopColor: '#000000',
    paddingTop: 5,
  },
  notes: {
    marginTop: 30,
  },
  footer: {
    position: 'absolute',
    fontSize: 10,
    bottom: 30,
    left: 35,
    right: 35,
    textAlign: 'center',
    color: 'grey',
  },
});

export const InvoicePDF: React.FC<InvoicePDFProps> = ({ 
  invoice, 
  items, 
  companyInfo = {
    name: "Your Company Name",
    address: "Your Company Address",
    phone: "Your Phone",
    email: "your@email.com",
    gstin: "Your GSTIN"
  },
  gstBreakdown
}) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>INVOICE</Text>
        <Text>Invoice #{invoice.invoice_number}</Text>
      </View>

      {/* Company and Supplier Info */}
      <View style={styles.invoiceInfo}>
        <View style={styles.companyInfo}>
          <Text style={styles.label}>From:</Text>
          <Text style={styles.text}>{companyInfo.name}</Text>
          <Text style={styles.text}>{companyInfo.address}</Text>
          <Text style={styles.text}>Phone: {companyInfo.phone}</Text>
          <Text style={styles.text}>Email: {companyInfo.email}</Text>
          <Text style={styles.text}>GSTIN: {companyInfo.gstin}</Text>
        </View>
        
        <View style={styles.supplierInfo}>
          <Text style={styles.label}>To:</Text>
          <Text style={styles.text}>
            {invoice.business_entities?.name || invoice.suppliers?.company_name || 'N/A'}
          </Text>
          {(invoice.business_entities?.address || invoice.suppliers?.address) && (
            <Text style={styles.text}>
              {invoice.business_entities?.address || invoice.suppliers?.address}
            </Text>
          )}
          {(invoice.business_entities?.phone || invoice.suppliers?.phone) && (
            <Text style={styles.text}>
              Phone: {invoice.business_entities?.phone || invoice.suppliers?.phone}
            </Text>
          )}
          {(invoice.business_entities?.email || invoice.suppliers?.email) && (
            <Text style={styles.text}>
              Email: {invoice.business_entities?.email || invoice.suppliers?.email}
            </Text>
          )}
          {(invoice.business_entities?.gstin || invoice.suppliers?.gstin) && (
            <Text style={styles.text}>
              GSTIN: {invoice.business_entities?.gstin || invoice.suppliers?.gstin}
            </Text>
          )}
          
          <Text style={[styles.text, { marginTop: 10 }]}>
            <Text style={styles.label}>Invoice Date: </Text>
            {new Date(invoice.invoice_date).toLocaleDateString('en-IN')}
          </Text>
          {invoice.due_date && (
            <Text style={styles.text}>
              <Text style={styles.label}>Due Date: </Text>
              {new Date(invoice.due_date).toLocaleDateString('en-IN')}
            </Text>
          )}
        </View>
      </View>

      {/* Items Table */}
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.col1}>Description</Text>
          <Text style={styles.col2}>Qty</Text>
          <Text style={styles.col3}>Rate</Text>
          <Text style={styles.col4}>GST%</Text>
          <Text style={styles.col5}>Amount</Text>
        </View>
        
        {items.map((item, index) => (
          <View key={index} style={styles.tableRow}>
            <Text style={styles.col1}>{item.description}</Text>
            <Text style={styles.col2}>{item.quantity}</Text>
            <Text style={styles.col3}>{formatIndianCurrency(item.unit_price, false)}</Text>
            <Text style={styles.col4}>{item.gst_rate}%</Text>
            <Text style={styles.col5}>{formatIndianCurrency(item.line_total, false)}</Text>
          </View>
        ))}
      </View>

      {/* Totals */}
      <View style={styles.totalsSection}>
        <View style={styles.totalRow}>
          <Text>Value of Goods (Original Price):</Text>
          <Text>{formatIndianCurrency(invoice.subtotal, false)}</Text>
        </View>
        {(() => {
          let totalDiscount = invoice.discount_amount || 0;
          if (invoice.discount_percentage && invoice.discount_percentage > 0) {
            const remainingAfterFlat = Math.max(0, invoice.subtotal - totalDiscount);
            totalDiscount += (remainingAfterFlat * invoice.discount_percentage) / 100;
          }
          const taxableValue = Math.max(0, invoice.subtotal - totalDiscount);
          
          return totalDiscount > 0 ? (
            <>
              <View style={styles.totalRow}>
                <Text>
                  (Less) Discount {invoice.discount_percentage 
                    ? `@ ${invoice.discount_percentage.toFixed(2)}%`
                    : ''}:
                </Text>
                <Text>({formatIndianCurrency(totalDiscount, false)})</Text>
              </View>
              <View style={styles.totalRow}>
                <Text>Transaction Value (Taxable Value):</Text>
                <Text>{formatIndianCurrency(taxableValue, false)}</Text>
              </View>
            </>
          ) : null;
        })()}
        {gstBreakdown && (gstBreakdown.cgst > 0 || gstBreakdown.sgst > 0 || gstBreakdown.igst > 0) ? (
          <>
            {gstBreakdown.cgst > 0 && (() => {
              let taxableValue = invoice.subtotal;
              if (invoice.discount_amount || invoice.discount_percentage) {
                let totalDiscount = invoice.discount_amount || 0;
                if (invoice.discount_percentage && invoice.discount_percentage > 0) {
                  const remainingAfterFlat = Math.max(0, invoice.subtotal - totalDiscount);
                  totalDiscount += (remainingAfterFlat * invoice.discount_percentage) / 100;
                }
                taxableValue = Math.max(0, invoice.subtotal - totalDiscount);
              }
              const cgstRate = taxableValue > 0 ? ((gstBreakdown.cgst / taxableValue) * 100).toFixed(0) : '0';
              return (
                <View style={styles.totalRow}>
                  <Text>Add: CGST @ {cgstRate}%:</Text>
                  <Text>{formatIndianCurrency(gstBreakdown.cgst, false)}</Text>
                </View>
              );
            })()}
            {gstBreakdown.sgst > 0 && (() => {
              let taxableValue = invoice.subtotal;
              if (invoice.discount_amount || invoice.discount_percentage) {
                let totalDiscount = invoice.discount_amount || 0;
                if (invoice.discount_percentage && invoice.discount_percentage > 0) {
                  const remainingAfterFlat = Math.max(0, invoice.subtotal - totalDiscount);
                  totalDiscount += (remainingAfterFlat * invoice.discount_percentage) / 100;
                }
                taxableValue = Math.max(0, invoice.subtotal - totalDiscount);
              }
              const sgstRate = taxableValue > 0 ? ((gstBreakdown.sgst / taxableValue) * 100).toFixed(0) : '0';
              return (
                <View style={styles.totalRow}>
                  <Text>Add: SGST @ {sgstRate}%:</Text>
                  <Text>{formatIndianCurrency(gstBreakdown.sgst, false)}</Text>
                </View>
              );
            })()}
            {gstBreakdown.igst > 0 && (
              <View style={styles.totalRow}>
                <Text>Add: IGST:</Text>
                <Text>{formatIndianCurrency(gstBreakdown.igst, false)}</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.totalRow}>
            <Text>Add: Tax Amount:</Text>
            <Text>{formatIndianCurrency(invoice.tax_amount, false)}</Text>
          </View>
        )}
        <View style={[styles.totalRow, styles.grandTotal]}>
          <Text style={styles.totalLabel}>Total Invoice Value:</Text>
          <Text style={styles.totalLabel}>{formatIndianCurrency(invoice.total_amount, false)}</Text>
        </View>
      </View>

      {/* Notes */}
      {invoice.notes && (
        <View style={styles.notes}>
          <Text style={styles.label}>Notes:</Text>
          <Text>{invoice.notes}</Text>
        </View>
      )}

      {/* Footer */}
      <Text style={styles.footer}>
        Thank you for your business!
      </Text>
    </Page>
  </Document>
);