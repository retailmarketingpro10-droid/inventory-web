import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Package, Save, RotateCcw, Check, AlertTriangle, Edit3, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { logger } from "@/lib/logger";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  current_stock: number;
  min_stock_level: number;
}

interface StockItem extends Product {
  counted_quantity: number;
  difference: number;
  selected: boolean;
  editing: boolean;
}

export const StockTakeManager = () => {
  const { selectedCompany } = useCompany();
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [allStockItems, setAllStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (selectedCompany) {
      fetchProducts();
    } else {
      setStockItems([]);
      setLoading(false);
    }
  }, [selectedCompany]);

  const fetchProducts = async () => {
    if (!selectedCompany) {
      setStockItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, unit, current_stock, min_stock_level')
        .eq('company_id', selectedCompany.company_name)
        .order('name');

      if (error) throw error;
      
      const items: StockItem[] = (data || []).map(product => ({
        ...product,
        counted_quantity: product.current_stock,
        difference: 0,
        selected: false,
        editing: false
      }));
      
      setAllStockItems(items);
      setStockItems(items);
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

  const updateCountedQuantity = (id: string, quantity: number) => {
    setAllStockItems(prev => prev.map(item => 
      item.id === id 
        ? { 
            ...item, 
            counted_quantity: quantity,
            difference: quantity - item.current_stock
          }
        : item
    ));
    setStockItems(prev => prev.map(item => 
      item.id === id 
        ? { 
            ...item, 
            counted_quantity: quantity,
            difference: quantity - item.current_stock
          }
        : item
    ));
  };

  const toggleEdit = (id: string) => {
    setAllStockItems(prev => prev.map(item =>
      item.id === id ? { ...item, editing: !item.editing } : item
    ));
    setStockItems(prev => prev.map(item =>
      item.id === id ? { ...item, editing: !item.editing } : item
    ));
  };

  const toggleSelect = (id: string) => {
    setAllStockItems(prev => {
      const updated = prev.map(item =>
        item.id === id ? { ...item, selected: !item.selected } : item
      );
      setSelectAll(updated.every(item => item.selected));
      return updated;
    });
    setStockItems(prev => {
      const newItems = prev.map(item =>
        item.id === id ? { ...item, selected: !item.selected } : item
      );
      return newItems;
    });
  };

  const toggleSelectAll = () => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);
    setAllStockItems(prev => prev.map(item => ({ ...item, selected: newSelectAll })));
    setStockItems(prev => prev.map(item => ({ ...item, selected: newSelectAll })));
  };

  const resetCountedQuantities = () => {
    setAllStockItems(prev => prev.map(item => ({
      ...item,
      counted_quantity: item.current_stock,
      difference: 0,
      editing: false
    })));
    setStockItems(prev => prev.map(item => ({
      ...item,
      counted_quantity: item.current_stock,
      difference: 0,
      editing: false
    })));
    toast({
      title: "Reset Complete",
      description: "All counted quantities reset to current stock levels"
    });
  };

  const bulkUpdateSelected = async () => {
    const selectedItems = allStockItems.filter(item => item.selected && item.difference !== 0);
    
    if (selectedItems.length === 0) {
      toast({
        title: "No Changes",
        description: "No selected items have quantity differences to update",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    let successCount = 0;
    let failedCount = 0;
    const failedItems: string[] = [];

    try {
      // Update all items with proper error handling per item
      for (const item of selectedItems) {
        try {
          let updateQuery = supabase
            .from('products')
            .update({ current_stock: item.counted_quantity })
            .eq('id', item.id);

          // Add company_id filter for data integrity
          if (selectedCompany?.company_name) {
            updateQuery = updateQuery.eq('company_id', selectedCompany.company_name);
          }

          const { error } = await updateQuery;

          if (error) {
            logger.error(`Error updating ${item.name}:`, error);
            failedItems.push(item.name);
            failedCount++;
          } else {
            successCount++;
          }
        } catch (itemError) {
          logger.error(`Error updating ${item.name}:`, itemError);
          failedItems.push(item.name);
          failedCount++;
        }
      }

      // Show results
      if (successCount > 0 && failedCount === 0) {
        toast({
          title: "Success",
          description: `Updated ${successCount} product quantities successfully`
        });
        fetchProducts();
      } else if (successCount > 0 && failedCount > 0) {
        toast({
          title: "Partial Success",
          description: `Updated ${successCount} products. ${failedCount} failed: ${failedItems.slice(0, 3).join(', ')}${failedItems.length > 3 ? '...' : ''}`,
          variant: "default"
        });
        fetchProducts();
      } else {
        toast({
          title: "Error",
          description: `Failed to update all ${failedCount} products: ${failedItems.slice(0, 3).join(', ')}${failedItems.length > 3 ? '...' : ''}`,
          variant: "destructive"
        });
      }
    } catch (error) {
      logger.error('Bulk update error:', error);
      toast({
        title: "Error",
        description: `Failed to update quantities: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSingleItem = async (item: StockItem) => {
    if (item.difference === 0) {
      toggleEdit(item.id);
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({ current_stock: item.counted_quantity })
        .eq('id', item.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Updated ${item.name} quantity`
      });
      
      fetchProducts();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update quantity",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const getDifferenceColor = (difference: number) => {
    if (difference > 0) return "text-green-600";
    if (difference < 0) return "text-red-600";
    return "text-muted-foreground";
  };

  const getDifferenceBadge = (difference: number) => {
    if (difference > 0) return <Badge variant="default" className="bg-green-100 text-green-800">+{difference}</Badge>;
    if (difference < 0) return <Badge variant="destructive">{difference}</Badge>;
    return <Badge variant="secondary">0</Badge>;
  };

  // Filter products based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setStockItems(allStockItems);
      setSelectAll(allStockItems.length > 0 && allStockItems.every(item => item.selected));
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = allStockItems.filter(item =>
      item.name.toLowerCase().includes(term) ||
      (item.sku && item.sku.toLowerCase().includes(term))
    );
    setStockItems(filtered);
    setSelectAll(filtered.length > 0 && filtered.every(item => item.selected));
  }, [searchTerm, allStockItems]);

  if (loading) {
    return <div className="text-center py-8">Loading stock items...</div>;
  }

  const selectedCount = stockItems.filter(item => item.selected).length;
  const itemsWithDifferences = stockItems.filter(item => item.difference !== 0).length;

  if (!selectedCompany) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Stock Take</h2>
            <p className="text-muted-foreground">Review and update inventory quantities</p>
          </div>
        </div>
        <Card>
          <CardContent className="text-center py-8">
            <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Please select a company to view and manage stock.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Stock Take</h2>
          <p className="text-muted-foreground">
            Review and update inventory quantities for {selectedCompany.company_name}
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetCountedQuantities}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset All
          </Button>
          <Button 
            onClick={bulkUpdateSelected}
            disabled={selectedCount === 0 || saving}
          >
            <Save className="w-4 h-4 mr-2" />
            Update Selected ({selectedCount})
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search products by name or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-11"
          />
        </div>
        {searchTerm && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchTerm("")}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="select-all"
            checked={selectAll}
            onCheckedChange={toggleSelectAll}
          />
          <Label htmlFor="select-all">Select All</Label>
        </div>
        <div className="text-sm text-muted-foreground">
          {stockItems.length} total items • {itemsWithDifferences} with differences • {selectedCount} selected
        </div>
      </div>

      <div className="grid gap-4">
        {stockItems.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No products found.</p>
            </CardContent>
          </Card>
        ) : (
          stockItems.map((item) => (
            <Card key={item.id} className={item.selected ? "border-primary" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={item.selected}
                      onCheckedChange={() => toggleSelect(item.id)}
                    />
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Package className="w-5 h-5" />
                        {item.name}
                        {item.sku && <Badge variant="outline">{item.sku}</Badge>}
                      </CardTitle>
                      <CardDescription>Unit: {item.unit}</CardDescription>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {item.difference !== 0 && getDifferenceBadge(item.difference)}
                    {item.current_stock <= item.min_stock_level && (
                      <Badge variant="destructive">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Low Stock
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <Label className="text-sm text-muted-foreground">Current Stock</Label>
                    <p className="font-semibold">{item.current_stock} {item.unit}</p>
                  </div>
                  
                  <div>
                    <Label htmlFor={`counted-${item.id}`} className="text-sm text-muted-foreground">
                      Counted Quantity
                    </Label>
                    {item.editing ? (
                      <Input
                        id={`counted-${item.id}`}
                        type="number"
                        value={item.counted_quantity}
                        onChange={(e) => updateCountedQuantity(item.id, parseInt(e.target.value) || 0)}
                        className="w-full"
                      />
                    ) : (
                      <p className="font-semibold">{item.counted_quantity} {item.unit}</p>
                    )}
                  </div>
                  
                  <div>
                    <Label className="text-sm text-muted-foreground">Difference</Label>
                    <p className={`font-semibold ${getDifferenceColor(item.difference)}`}>
                      {item.difference > 0 ? '+' : ''}{item.difference} {item.unit}
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleEdit(item.id)}
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    
                    {item.difference !== 0 && (
                      <Button
                        size="sm"
                        onClick={() => updateSingleItem(item)}
                        disabled={saving}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Update
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};