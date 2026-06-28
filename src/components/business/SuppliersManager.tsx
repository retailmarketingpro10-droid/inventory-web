import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { fetchSuppliersForCompany } from "@/lib/supplierScope";
import { useSubscription } from "@/hooks/useSubscription";
import { Plus, Building2, Phone, Mail, MapPin, Edit, Trash2, Download, Upload } from "lucide-react";
import { downloadReportAsCSV } from "@/utils/pdfGenerator";
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

interface Supplier {
  id: string;
  company_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  pan: string | null;
}

export const SuppliersManager = () => {
  const { selectedCompany } = useCompany();
  const { isReadOnly } = useSubscription();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
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
    fetchSuppliers();
  }, [selectedCompany]);

  const fetchSuppliers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSuppliers([]);
        return;
      }

      const data = await fetchSuppliersForCompany({
        companyName: selectedCompany?.company_name,
        userId: user.id,
        select: '*',
      });

      setSuppliers(data as Supplier[]);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load suppliers",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Get current user for RLS compliance
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (!selectedCompany?.company_name) {
        toast({
          title: "Validation Error",
          description: "Please select a company before adding a supplier",
          variant: "destructive"
        });
        return;
      }

      const supplierData = {
        ...formData,
        user_id: user.id,
        company_id: selectedCompany?.company_name || null
      };

      if (editingSupplier) {
        const { error } = await supabase
          .from('suppliers')
          .update(supplierData)
          .eq('id', editingSupplier.id);

        if (error) throw error;
        toast({ title: "Success", description: "Supplier updated successfully" });
      } else {
        const { error } = await supabase
          .from('suppliers')
          .insert([supplierData]);

        if (error) throw error;
        toast({ title: "Success", description: "Supplier added successfully" });
      }

      resetForm();
      fetchSuppliers();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save supplier",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id: string) => {
    setSupplierToDelete(id);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!supplierToDelete) return;
    
    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', supplierToDelete);

      if (error) throw error;
      toast({ title: "Success", description: "Supplier deleted successfully" });
      fetchSuppliers();
      setShowDeleteDialog(false);
      setSupplierToDelete(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete supplier",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      company_name: "",
      contact_person: "",
      email: "",
      phone: "",
      address: "",
      gstin: "",
      pan: ""
    });
    setEditingSupplier(null);
    setOpen(false);
  };

  const startEdit = (supplier: Supplier) => {
    setFormData({
      company_name: supplier.company_name,
      contact_person: supplier.contact_person || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      gstin: supplier.gstin || "",
      pan: supplier.pan || ""
    });
    setEditingSupplier(supplier);
    setOpen(true);
  };

  const downloadSuppliersReport = () => {
    const reportData = suppliers.map(supplier => ({
      company_name: supplier.company_name,
      contact_person: supplier.contact_person || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      gstin: supplier.gstin || '',
      pan: supplier.pan || ''
    }));
    
    downloadReportAsCSV(
      'Suppliers Report',
      reportData,
      ['company_name', 'contact_person', 'email', 'phone', 'gstin', 'pan']
    );
    
    toast({ title: "Success", description: "Suppliers report downloaded successfully" });
  };

  if (loading) {
    return <div className="text-center py-8">Loading suppliers...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Suppliers</h2>
          <p className="text-muted-foreground">Manage your business suppliers and vendors</p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={isReadOnly}>
            <Upload className="w-4 h-4 mr-2" />
            Import from ERP
          </Button>
          
          <Button variant="outline" onClick={downloadSuppliersReport}>
            <Download className="w-4 h-4 mr-2" />
            Download Report
          </Button>
          
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()} disabled={isReadOnly}>
              <Plus className="w-4 h-4 mr-2" />
              Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingSupplier ? "Edit Supplier" : "Add New Supplier"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="company_name">Company Name *</Label>
                <Input
                  id="company_name"
                  value={formData.company_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="contact_person">Contact Person</Label>
                <Input
                  id="contact_person"
                  value={formData.contact_person}
                  onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="gstin">GSTIN</Label>
                  <Input
                    id="gstin"
                    value={formData.gstin}
                    onChange={(e) => setFormData(prev => ({ ...prev, gstin: e.target.value }))}
                    placeholder="15 characters"
                  />
                </div>
                <div>
                  <Label htmlFor="pan">PAN</Label>
                  <Input
                    id="pan"
                    value={formData.pan}
                    onChange={(e) => setFormData(prev => ({ ...prev, pan: e.target.value }))}
                    placeholder="10 characters"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingSupplier ? "Update" : "Add"} Supplier
                </Button>
              </div>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by company, contact, email, phone, GSTIN..."
          value={supplierSearch}
          onChange={(e) => setSupplierSearch(e.target.value)}
        />
      </div>

      <div className="grid gap-4">
        {suppliers.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No suppliers found. Add your first supplier to get started.</p>
            </CardContent>
          </Card>
        ) : (
          suppliers
            .filter((s) => {
              if (!supplierSearch.trim()) return true;
              const term = supplierSearch.toLowerCase();
              return (
                s.company_name.toLowerCase().includes(term) ||
                (s.contact_person || '').toLowerCase().includes(term) ||
                (s.email || '').toLowerCase().includes(term) ||
                (s.phone || '').toLowerCase().includes(term) ||
                (s.gstin || '').toLowerCase().includes(term)
              );
            })
            .map((supplier) => (
            <Card key={supplier.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="w-5 h-5" />
                      {supplier.company_name}
                    </CardTitle>
                    {supplier.contact_person && (
                      <CardDescription>{supplier.contact_person}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => startEdit(supplier)}
                      disabled={isReadOnly}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleDelete(supplier.id)}
                      className="text-destructive hover:text-destructive"
                      disabled={isReadOnly}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {supplier.email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="w-4 h-4" />
                      {supplier.email}
                    </div>
                  )}
                  {supplier.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="w-4 h-4" />
                      {supplier.phone}
                    </div>
                  )}
                  {supplier.address && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      {supplier.address}
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    {supplier.gstin && (
                      <Badge variant="secondary">GSTIN: {supplier.gstin}</Badge>
                    )}
                    {supplier.pan && (
                      <Badge variant="secondary">PAN: {supplier.pan}</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* ERP Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto modal-scrollbar">
          <DialogHeader>
            <DialogTitle>Bulk Import Suppliers</DialogTitle>
            <DialogDescription>
              Import multiple suppliers from CSV files exported from Tally, SAP, or other ERP systems
            </DialogDescription>
          </DialogHeader>
          <ERPImportManager 
            onClose={() => {
              setImportOpen(false);
            }}
            onImportComplete={() => {
              fetchSuppliers(); // Refresh suppliers after import
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this supplier? This action cannot be undone.
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