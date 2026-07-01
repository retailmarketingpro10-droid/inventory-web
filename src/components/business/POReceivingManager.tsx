import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Package, Check, AlertTriangle, Save, RotateCcw } from 'lucide-react';
import { formatIndianCurrency } from '@/utils/indianBusiness';
import { calculateGSTBreakdown, GSTConfig } from '@/utils/gstBreakdown';
import { logger } from '@/lib/logger';

interface PurchaseOrderItem {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  gst_rate: number;
  line_total: number;
  received_quantity: number;
  product?: {
    id: string;
    name: string;
    current_stock: number;
  };
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  company_id?: string | null;
  order_date: string;
  expected_delivery_date: string | null;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  suppliers?: {
    company_name: string;
    state: string;
  };
}

interface POReceivingManagerProps {
  po: PurchaseOrder;
  onClose: () => void;
  onInventoryUpdated: () => void;
}

export const POReceivingManager: React.FC<POReceivingManagerProps> = ({
  po,
  onClose,
  onInventoryUpdated
}) => {
  const [poItems, setPOItems] = useState<PurchaseOrderItem[]>([]);
  const [receivingItems, setReceivingItems] = useState<{[key: string]: number}>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [forceIGST, setForceIGST] = useState(false); // Manual IGST selection override
  const [gstConfig, setGstConfig] = useState<GSTConfig>({
    fromState: '27', // Maharashtra (default)
    toState: '27',
    isInterState: false
  });
  const { toast } = useToast();

  const fetchPOItems = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          product:products(id, name, current_stock)
        `)
        .eq('purchase_order_id', po.id);

      if (error) throw error;
      
      setPOItems(data || []);
      
      // New quantities to receive in this session (not cumulative received)
      const initialReceiving: {[key: string]: number} = {};
      (data || []).forEach(item => {
        initialReceiving[item.id] = 0;
      });
      setReceivingItems(initialReceiving);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load PO items",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPOItems();
  }, [po.id]);

  // Initialize GST config from PO supplier state and company state
  useEffect(() => {
    const initializeGSTConfig = async () => {
      let fromState = '27';
      let toState = '27';
      
      // Get supplier state from PO
      if (po.suppliers?.state) {
        fromState = po.suppliers.state;
      }
      
      // Fetch company state from profile
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('business_entities')
            .eq('id', user.id)
            .single();

          if (profileData?.business_entities?.[0]?.state) {
            toState = profileData.business_entities[0].state;
          }
        }
      } catch (error) {
        logger.error('Failed to fetch company state:', error);
      }
      
      // Update GST config
      setGstConfig(prev => {
        const isInterState = forceIGST || (fromState !== toState && fromState && toState);
        return {
          fromState,
          toState,
          isInterState: prev.isInterState || isInterState
        };
      });
    };
    
    initializeGSTConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po.suppliers?.state]);

  // Update isInterState when forceIGST changes
  useEffect(() => {
    setGstConfig(prev => ({
      ...prev,
      isInterState: forceIGST || (prev.fromState !== prev.toState && prev.fromState && prev.toState)
    }));
  }, [forceIGST]);

  const updateReceivingQuantity = (itemId: string, quantity: number) => {
    const item = poItems.find(i => i.id === itemId);
    if (!item) return;
    
    const maxQuantity = item.quantity - (item.received_quantity || 0);
    const newQuantity = Math.min(maxQuantity, Math.max(0, quantity));
    
    setReceivingItems(prev => ({
      ...prev,
      [itemId]: newQuantity
    }));
  };

  const toggleSelect = (itemId: string) => {
    setReceivingItems(prev => {
      const newItems = { ...prev };
      const currentQuantity = newItems[itemId] || 0;
      const item = poItems.find(i => i.id === itemId);
      
      if (item) {
        const maxQuantity = item.quantity - (item.received_quantity || 0);
        newItems[itemId] = currentQuantity > 0 ? 0 : maxQuantity;
      }
      
      return newItems;
    });
  };

  const toggleSelectAll = () => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);
    
    setReceivingItems(prev => {
      const newItems = { ...prev };
      poItems.forEach(item => {
        const maxQuantity = item.quantity - (item.received_quantity || 0);
        newItems[item.id] = newSelectAll ? maxQuantity : 0;
      });
      return newItems;
    });
  };

  const resetQuantities = () => {
    const resetItems: {[key: string]: number} = {};
    poItems.forEach(item => {
      resetItems[item.id] = 0;
    });
    setReceivingItems(resetItems);
    setSelectAll(false);
  };

  const updateReceipt = async () => {
    setSaving(true);
    
    try {
      const itemsToUpdate = poItems.filter(item => 
        receivingItems[item.id] > 0
      );
      
      if (itemsToUpdate.length === 0) {
        toast({
          title: "No Changes",
          description: "No items selected for receiving",
          variant: "destructive"
        });
        return;
      }

      // Update received quantities in purchase_order_items
      for (const item of itemsToUpdate) {
        const newReceivedQuantity = (item.received_quantity || 0) + receivingItems[item.id];
        
        const { error: updateError } = await supabase
          .from('purchase_order_items')
          .update({ received_quantity: newReceivedQuantity })
          .eq('id', item.id);

        if (updateError) {
          logger.error('Error updating PO item:', updateError);
          throw new Error(`Failed to update item "${item.description}": ${updateError.message || 'Unknown error'}`);
        }
      }

      // Check if all items are fully received (stock already updated on PO creation)
      const allItemsReceived = poItems.every(item => 
        (item.received_quantity || 0) + (receivingItems[item.id] || 0) >= item.quantity
      );

      // Update PO status if all items received
      if (allItemsReceived) {
        const { error: statusError } = await supabase
          .from('purchase_orders')
          .update({ status: 'received' })
          .eq('id', po.id);

        if (statusError) {
          logger.error('Error updating PO status:', statusError);
          throw new Error(`Failed to update PO status: ${statusError.message || 'Unknown error'}`);
        }
      } else {
        // Update to partial if some items received
        const { error: statusError } = await supabase
          .from('purchase_orders')
          .update({ status: 'partial' })
          .eq('id', po.id);

        if (statusError) {
          logger.error('Error updating PO status:', statusError);
          throw new Error(`Failed to update PO status: ${statusError.message || 'Unknown error'}`);
        }
      }

      toast({
        title: "Success",
        description: `Receipt recorded for ${itemsToUpdate.length} item(s). PO marked as ${allItemsReceived ? 'received' : 'partially received'}. Stock was already updated when the PO was created.`,
      });

      onInventoryUpdated();
      onClose();
    } catch (error: any) {
      logger.error('Error updating PO receipt:', error);
      const errorMessage = error?.message || error?.details || 'Failed to update receipt';
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const getReceivingStatus = (item: PurchaseOrderItem) => {
    const totalReceived = (item.received_quantity || 0) + (receivingItems[item.id] || 0);
    const percentage = (totalReceived / item.quantity) * 100;
    
    if (percentage >= 100) return { status: 'complete', color: 'bg-green-500' };
    if (percentage > 0) return { status: 'partial', color: 'bg-yellow-500' };
    return { status: 'pending', color: 'bg-gray-300' };
  };

  const getTotalReceivingValue = () => {
    return poItems.reduce((total, item) => {
      const receivingQty = receivingItems[item.id] || 0;
      return total + (receivingQty * item.unit_price);
    }, 0);
  };

  if (loading) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Loading</DialogTitle>
            <DialogDescription>Please wait while we load the purchase order items.</DialogDescription>
          </DialogHeader>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading PO items...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const selectedCount = Object.values(receivingItems).filter(qty => qty > 0).length;
  const totalReceivingValue = getTotalReceivingValue();

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto custom-scrollbar-dark smooth-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Receive Items - {po.po_number}
          </DialogTitle>
          <DialogDescription>
            Confirm the quantities received for this purchase order. Stock is updated when the PO is created; this step tracks delivery status only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* PO Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Purchase Order Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">PO Number</p>
                  <p className="font-semibold">{po.po_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Order Date</p>
                  <p className="font-semibold">{new Date(po.order_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Expected Delivery</p>
                  <p className="font-semibold">
                    {po.expected_delivery_date ? new Date(po.expected_delivery_date).toLocaleDateString() : 'Not set'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={po.status === 'received' ? 'default' : 'secondary'}>
                    {po.status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* GST Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">GST Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>From State (Supplier)</Label>
                  <Input
                    value={gstConfig.fromState}
                    onChange={(e) => {
                      const newFromState = e.target.value;
                      setGstConfig(prev => ({ 
                        ...prev, 
                        fromState: newFromState,
                        isInterState: forceIGST || (newFromState !== prev.toState && newFromState && prev.toState)
                      }));
                    }}
                    placeholder="State code"
                  />
                </div>
                <div>
                  <Label>To State (Your Company)</Label>
                  <Input
                    value={gstConfig.toState}
                    onChange={(e) => {
                      const newToState = e.target.value;
                      setGstConfig(prev => ({ 
                        ...prev, 
                        toState: newToState,
                        isInterState: forceIGST || (prev.fromState !== newToState && prev.fromState && newToState)
                      }));
                    }}
                    placeholder="State code"
                  />
                </div>
              </div>
              
              {/* IGST Override Option */}
              <div className="flex items-center space-x-2 p-3 border rounded-md bg-muted/50">
                <input
                  type="checkbox"
                  id="forceIGST"
                  checked={forceIGST}
                  onChange={(e) => {
                    const newForceIGST = e.target.checked;
                    setForceIGST(newForceIGST);
                    setGstConfig(prev => ({ 
                      ...prev, 
                      isInterState: newForceIGST || (prev.fromState !== prev.toState && prev.fromState && prev.toState)
                    }));
                  }}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
                />
                <Label htmlFor="forceIGST" className="font-normal cursor-pointer text-sm">
                  Force IGST (Apply full tax % as IGST regardless of state)
                </Label>
              </div>
              
              <p className="text-sm text-muted-foreground">
                {gstConfig.isInterState ? 'Inter-state transaction (IGST applies)' : 'Intra-state transaction (CGST + SGST applies)'}
              </p>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="select-all"
                  checked={selectAll}
                  onCheckedChange={toggleSelectAll}
                />
                <Label htmlFor="select-all">Select All</Label>
              </div>
              <Button variant="outline" onClick={resetQuantities}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Receiving Value</p>
              <p className="text-lg font-semibold">{formatIndianCurrency(totalReceivingValue)}</p>
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-4">
            {poItems.map((item) => {
              const receivingStatus = getReceivingStatus(item);
              const maxReceivable = item.quantity - (item.received_quantity || 0);
              const currentReceiving = receivingItems[item.id] || 0;
              
              return (
                <Card key={item.id} className={currentReceiving > 0 ? "border-primary" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={currentReceiving > 0}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                        <div>
                          <h4 className="font-medium">{item.description}</h4>
                          {item.product && (
                            <p className="text-sm text-muted-foreground">
                              Product: {item.product.name} | Current Stock: {item.product.current_stock}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={receivingStatus.status === 'complete' ? 'default' : 'secondary'}>
                          {receivingStatus.status}
                        </Badge>
                        {item.received_quantity > 0 && (
                          <Badge variant="outline">
                            Previously: {item.received_quantity}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <Label className="text-sm text-muted-foreground">Ordered Quantity</Label>
                        <p className="font-semibold">{item.quantity}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Max Receivable</Label>
                        <p className="font-semibold text-warning">{maxReceivable}</p>
                      </div>
                      <div>
                        <Label htmlFor={`receiving-${item.id}`} className="text-sm text-muted-foreground">
                          Receiving Quantity
                        </Label>
                        <Input
                          id={`receiving-${item.id}`}
                          type="number"
                          min="0"
                          max={maxReceivable}
                          value={currentReceiving}
                          onChange={(e) => updateReceivingQuantity(item.id, parseInt(e.target.value) || 0)}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Line Value</Label>
                        <p className="font-semibold">{formatIndianCurrency(currentReceiving * item.unit_price)}</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4">
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className={`${receivingStatus.color} h-2 rounded-full transition-all duration-300`}
                          style={{ 
                            width: `${Math.min(100, ((item.received_quantity || 0) + currentReceiving) / item.quantity * 100)}%` 
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(((item.received_quantity || 0) + currentReceiving) / item.quantity * 100).toFixed(1)}% received
                      </p>
                    </div>

                    {/* GST Breakdown */}
                    {currentReceiving > 0 && (
                      <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                        <h5 className="font-medium text-sm mb-2">GST Breakdown for Receiving Quantity</h5>
                        {(() => {
                          const breakdown = calculateGSTBreakdown(
                            currentReceiving * item.unit_price,
                            item.gst_rate,
                            gstConfig
                          );
                          return (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                              <div>Taxable: {formatIndianCurrency(breakdown.taxableAmount)}</div>
                              {breakdown.cgst > 0 && <div>CGST: {formatIndianCurrency(breakdown.cgst)}</div>}
                              {breakdown.sgst > 0 && <div>SGST: {formatIndianCurrency(breakdown.sgst)}</div>}
                              {breakdown.igst > 0 && <div>IGST: {formatIndianCurrency(breakdown.igst)}</div>}
                              <div className="font-semibold">Total: {formatIndianCurrency(breakdown.totalAmount)}</div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={updateReceipt}
              disabled={selectedCount === 0 || saving}
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : `Confirm Receipt (${selectedCount} items)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
