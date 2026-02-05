import React, { Suspense, lazy } from "react";
import { 
  Package, 
  BarChart3, 
  ShoppingCart, 
  Warehouse, 
  Truck, 
  FileText, 
  Calculator, 
  Plus, 
  RefreshCw,
  Building,
  Upload,
  WifiOff,
  LogOut,
  Receipt,
  BookOpen,
  Settings,
  CreditCard,
  Trash2
} from "lucide-react";
import { StatCard } from "@/components/inventory/StatCard";
import { NavButton } from "@/components/inventory/NavButton";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

// Lazy load components for better performance
const ImportModal = lazy(() => 
  import("@/components/inventory/ImportModal")
    .then(m => ({ default: m.ImportModal }))
    .catch((error) => {
      logger.error('Failed to load ImportModal:', error);
      // Return a fallback component
      return { default: () => <div>Failed to load import modal. Please refresh the page.</div> };
    })
);
const GSTCalculator = lazy(() => import("@/components/inventory/GSTCalculator").then(m => ({ default: m.GSTCalculator })));
const GSTTracker = lazy(() => import("@/components/gst/GSTTracker").then(m => ({ default: m.GSTTracker })));
const LedgerManager = lazy(() => import("@/components/ledger/LedgerManager").then(m => ({ default: m.LedgerManager })));
const SuppliersManager = lazy(() => import("@/components/business/SuppliersManager").then(m => ({ default: m.SuppliersManager })));
const ProductsManager = lazy(() => import("@/components/business/ProductsManager").then(m => ({ default: m.ProductsManager })));
const InvoiceManager = lazy(() => import("@/components/business/InvoiceManager").then(m => ({ default: m.InvoiceManager })));
const PurchaseOrderManager = lazy(() => import("@/components/business/PurchaseOrderManager").then(m => ({ default: m.PurchaseOrderManager })));
const StockTakeManager = lazy(() => import("@/components/inventory/StockTakeManager").then(m => ({ default: m.StockTakeManager })));
const CompanySettings = lazy(() => import("@/components/business/CompanySettings").then(m => ({ default: m.CompanySettings })));
const ReportsManager = lazy(() => import("@/components/reports/ReportsManager").then(m => ({ default: m.ReportsManager })));
const SubscriptionManager = lazy(() => import("@/components/subscription/SubscriptionManager").then(m => ({ default: m.SubscriptionManager })));

const Index = () => {
  const { user, signOut } = useAuth();
  const { selectedCompany, setSelectedCompany, companies, setCompanies, restoreSelectedCompany } = useCompany();
  const location = useLocation();
  const [activeTab, setActiveTab] = React.useState("dashboard");
  const [dashboardData, setDashboardData] = React.useState({
    totalProducts: 1247,
    lowStockItems: 23,
    pendingPOs: 8,
    totalInvoices: 156,
  });
  const [isOffline, setIsOffline] = React.useState(false);
  const [showImportModal, setShowImportModal] = React.useState(false);
  const [showAddCompanyDialog, setShowAddCompanyDialog] = React.useState(false);
  const [isSavingCompany, setIsSavingCompany] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [companyToDelete, setCompanyToDelete] = React.useState<{ company_name: string; id: number; [key: string]: any } | null>(null);
  const [companyFormData, setCompanyFormData] = React.useState({
    company_name: "",
    owner_name: "",
    owner_phone: "",
    address: "",
    city: "",
    state: "",
    postalcode: "",
    country: "India",
    gst: "",
    website: "",
    email: "",
    phone: "",
  });

  // Check online/offline status
  React.useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOffline(!navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Check URL parameters for tab (e.g., ?tab=subscription)
  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && ["dashboard", "gst-calculator", "gst-tracker", "reports", "ledger", "products", "stock-take", "purchase-orders", "invoices", "suppliers", "subscription", "settings"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [location.search]);

  // Fetch companies from user profile
  React.useEffect(() => {
    if (user) {
      fetchCompanies();
    }
  }, [user]);

  const fetchCompanies = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('business_entities')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data?.business_entities && Array.isArray(data.business_entities) && data.business_entities.length > 0) {
        // Convert business_entities to companies format
        // Filter out any entities with null/undefined company_name or name
        const companiesList = data.business_entities
          .filter((entity: any) => entity && (entity.company_name || entity.name))
          .map((entity: any, index: number) => ({
            id: index + 1,
            company_name: entity.company_name || entity.name || "Untitled Company",
            ...entity
          }));
        
        if (companiesList.length > 0) {
          setCompanies(companiesList);
          // Restore previously selected company for this user
          restoreSelectedCompany(user.id, companiesList);
        } else {
          setCompanies([]);
        }
      } else {
        setCompanies([]);
      }
    } catch (error) {
      logger.error('Failed to load companies:', error);
      toast.error('Failed to load companies');
    }
  };

  // Note: Company selection is now handled by restoreSelectedCompany in fetchCompanies

  const loadDashboardData = React.useCallback(async () => {
    if (!selectedCompany?.company_name || !user) {
      setDashboardData({
        totalProducts: 0,
        lowStockItems: 0,
        pendingPOs: 0,
        totalInvoices: 0,
      });
      return;
    }

    try {
      // Fetch products count
      let productsQuery = supabase
        .from('products')
        .select('id, current_stock, min_stock_level', { count: 'exact', head: false })
        .eq('company_id', selectedCompany.company_name);

      const { data: products, error: productsError } = await productsQuery;
      
      if (productsError) throw productsError;
      
      const totalProducts = products?.length || 0;
      const lowStockItems = products?.filter(p => (p.current_stock || 0) <= (p.min_stock_level || 0)).length || 0;

      // Fetch pending purchase orders count
      let poQuery = supabase
        .from('purchase_orders')
        .select('id', { count: 'exact', head: false })
        .eq('company_id', selectedCompany.company_name)
        .in('status', ['draft', 'sent', 'partial']);

      const { data: pendingPOs, count: poCount } = await poQuery;
      const pendingPOCount = poCount || 0;

      // Fetch invoices count
      let invoicesQuery = supabase
        .from('invoices')
        .select('id', { count: 'exact', head: false })
        .eq('company_id', selectedCompany.company_name);

      const { data: invoices, count: invoiceCount } = await invoicesQuery;
      const totalInvoicesCount = invoiceCount || 0;

      setDashboardData({
        totalProducts,
        lowStockItems,
        pendingPOs: pendingPOCount,
        totalInvoices: totalInvoicesCount,
      });
    } catch (error) {
      logger.error('Failed to load dashboard data:', error);
    }
  }, [selectedCompany, user]);

  // Refresh dashboard data when company changes
  React.useEffect(() => {
    if (selectedCompany) {
      loadDashboardData();
    }
  }, [selectedCompany, loadDashboardData]);

  const handleImportComplete = () => {
    loadDashboardData();
  };

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error('Error signing out');
    } else {
      toast.success('Signed out successfully');
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please sign in to add a company');
      return;
    }

    if (!companyFormData.company_name.trim()) {
      toast.error('Company name is required');
      return;
    }

    setIsSavingCompany(true);
    try {
      // Get existing business_entities from profile
      const { data: profileData, error: fetchError } = await supabase
        .from('profiles')
        .select('business_entities')
        .eq('id', user.id)
        .single();

      if (fetchError) throw fetchError;

      // Prepare new company data
      const newCompany = {
        company_name: companyFormData.company_name,
        owner_name: companyFormData.owner_name,
        owner_phone: companyFormData.owner_phone,
        address: companyFormData.address,
        city: companyFormData.city,
        state: companyFormData.state,
        postalcode: companyFormData.postalcode,
        country: companyFormData.country,
        gst: companyFormData.gst,
        website: companyFormData.website,
        email: companyFormData.email || user.email,
        phone: companyFormData.phone,
        year_start: new Date().getFullYear(),
        currency: "INR"
      };

      // Merge with existing companies or create new array
      const existingCompanies = (profileData?.business_entities && Array.isArray(profileData.business_entities)) 
        ? profileData.business_entities 
        : [];
      
      const updatedCompanies = [...existingCompanies, newCompany];

      // Update profile with new company
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ business_entities: updatedCompanies })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast.success('Company added successfully!');
      setShowAddCompanyDialog(false);
      
      // Reset form
      setCompanyFormData({
        company_name: "",
        owner_name: "",
        owner_phone: "",
        address: "",
        city: "",
        state: "",
        postalcode: "",
        country: "India",
        gst: "",
        website: "",
        email: "",
        phone: "",
      });

      // Refresh companies list
      await fetchCompanies();
      
      // Auto-select the newly added company
      const { data: refreshedData } = await supabase
        .from('profiles')
        .select('business_entities')
        .eq('id', user.id)
        .single();
      
      if (refreshedData?.business_entities && Array.isArray(refreshedData.business_entities)) {
        const newCompanyInList = refreshedData.business_entities.find(
          (entity: any) => entity.company_name === newCompany.company_name
        );
        if (newCompanyInList) {
          const company = {
            id: refreshedData.business_entities.length,
            company_name: newCompanyInList.company_name || newCompanyInList.name || "Untitled Company",
            ...newCompanyInList
          };
          setSelectedCompany(company, user.id);
        }
      }
    } catch (error: any) {
      logger.error('Failed to add company:', error);
      toast.error(error.message || 'Failed to add company');
    } finally {
      setIsSavingCompany(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!user || !companyToDelete) {
      return;
    }

    try {
      // Get existing business_entities from profile
      const { data: profileData, error: fetchError } = await supabase
        .from('profiles')
        .select('business_entities')
        .eq('id', user.id)
        .single();

      if (fetchError) throw fetchError;

      const existingCompanies = (profileData?.business_entities && Array.isArray(profileData.business_entities)) 
        ? profileData.business_entities 
        : [];
      
      // Remove the company from the array
      const updatedCompanies = existingCompanies.filter(
        (entity: any) => entity.company_name !== companyToDelete.company_name
      );

      // Update profile with updated companies
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ business_entities: updatedCompanies })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast.success('Company deleted successfully!');
      setShowDeleteConfirm(false);
      setCompanyToDelete(null);

      // If the deleted company was selected, clear selection or select another
      if (selectedCompany?.company_name === companyToDelete.company_name) {
        setSelectedCompany(null, user.id);
        // Clear localStorage for this user's selected company
        localStorage.removeItem(`selectedCompany_${user.id}`);
      }

      // Refresh companies list
      await fetchCompanies();
    } catch (error: any) {
      logger.error('Failed to delete company:', error);
      toast.error(error.message || 'Failed to delete company');
    }
  };


  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-card-foreground flex items-center gap-2">
                <Package className="h-6 w-6" />
                Inventory Migrator
              </h1>
              {isOffline && (
                <span className="bg-warning/10 text-warning px-2 py-1 rounded-full text-xs flex items-center gap-1">
                  <WifiOff className="h-3 w-3" />
                  Offline
                </span>
              )}
              {user && (
                <span className="text-sm text-muted-foreground">
                  Welcome, {user.email}
                </span>
              )}
            </div>

            {/* Company Selector */}
            <div className="flex items-center space-x-4">
              <Button 
                onClick={() => setShowAddCompanyDialog(true)}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 flex items-center gap-2 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Company
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Import Modal */}
      {showImportModal && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
          <ImportModal
            isOpen={showImportModal}
            onClose={() => setShowImportModal(false)}
            selectedCompany={selectedCompany}
            onImportComplete={handleImportComplete}
          />
        </Suspense>
      )}

      {/* Delete Company Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Company</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <strong>{companyToDelete?.company_name}</strong>? 
              This action cannot be undone and will remove all company data.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteConfirm(false);
                setCompanyToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCompany}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Company Dialog */}
      <Dialog open={showAddCompanyDialog} onOpenChange={setShowAddCompanyDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Company</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCompany} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company_name">Company Name *</Label>
                <Input
                  id="company_name"
                  value={companyFormData.company_name}
                  onChange={(e) => setCompanyFormData(prev => ({ ...prev, company_name: e.target.value }))}
                  required
                  placeholder="Enter company name"
                />
              </div>
              <div>
                <Label htmlFor="owner_name">Owner Name</Label>
                <Input
                  id="owner_name"
                  value={companyFormData.owner_name}
                  onChange={(e) => setCompanyFormData(prev => ({ ...prev, owner_name: e.target.value }))}
                  placeholder="Enter owner name"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={companyFormData.email}
                  onChange={(e) => setCompanyFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="company@example.com"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={companyFormData.phone}
                  onChange={(e) => setCompanyFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+91-1234567890"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="owner_phone">Owner Phone</Label>
              <Input
                id="owner_phone"
                value={companyFormData.owner_phone}
                onChange={(e) => setCompanyFormData(prev => ({ ...prev, owner_phone: e.target.value }))}
                placeholder="+91-1234567890"
              />
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={companyFormData.address}
                onChange={(e) => setCompanyFormData(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Enter company address"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={companyFormData.city}
                  onChange={(e) => setCompanyFormData(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="Enter city"
                />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={companyFormData.state}
                  onChange={(e) => setCompanyFormData(prev => ({ ...prev, state: e.target.value }))}
                  placeholder="Enter state"
                />
              </div>
              <div>
                <Label htmlFor="postalcode">Postal Code</Label>
                <Input
                  id="postalcode"
                  value={companyFormData.postalcode}
                  onChange={(e) => setCompanyFormData(prev => ({ ...prev, postalcode: e.target.value }))}
                  placeholder="Enter postal code"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={companyFormData.country}
                  onChange={(e) => setCompanyFormData(prev => ({ ...prev, country: e.target.value }))}
                  placeholder="India"
                />
              </div>
              <div>
                <Label htmlFor="gst">GSTIN</Label>
                <Input
                  id="gst"
                  value={companyFormData.gst}
                  onChange={(e) => setCompanyFormData(prev => ({ ...prev, gst: e.target.value }))}
                  placeholder="Enter GSTIN"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="text"
                value={companyFormData.website}
                onChange={(e) => setCompanyFormData(prev => ({ ...prev, website: e.target.value }))}
                placeholder="https://example.com"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowAddCompanyDialog(false)}
                disabled={isSavingCompany}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSavingCompany}>
                {isSavingCompany ? "Saving..." : "Add Company"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:w-64">
            <div className="bg-card rounded-lg shadow-sm p-4 border border-border">
              <nav className="space-y-2">
                <NavButton
                  id="dashboard"
                  label="Dashboard"
                  icon={<BarChart3 className="h-5 w-5" />}
                  active={activeTab === "dashboard"}
                  onClick={setActiveTab}
                />
                <NavButton
                  id="products"
                  label="Products"
                  icon={<Package className="h-5 w-5" />}
                  active={activeTab === "products"}
                  onClick={setActiveTab}
                />
                <NavButton
                  id="purchase-orders"
                  label="Purchase Orders"
                  icon={<ShoppingCart className="h-5 w-5" />}
                  active={activeTab === "purchase-orders"}
                  onClick={setActiveTab}
                />
                <NavButton
                  id="stock-take"
                  label="Stock Take"
                  icon={<Warehouse className="h-5 w-5" />}
                  active={activeTab === "stock-take"}
                  onClick={setActiveTab}
                />
                <NavButton
                  id="suppliers"
                  label="Suppliers"
                  icon={<Truck className="h-5 w-5" />}
                  active={activeTab === "suppliers"}
                  onClick={setActiveTab}
                />
                <NavButton
                  id="invoices"
                  label="Invoices"
                  icon={<FileText className="h-5 w-5" />}
                  active={activeTab === "invoices"}
                  onClick={setActiveTab}
                />
                <NavButton
                  id="gst-calculator"
                  label="GST Calculator"
                  icon={<Calculator className="h-5 w-5" />}
                  active={activeTab === "gst-calculator"}
                  onClick={setActiveTab}
                />
                <NavButton
                  id="gst-tracker"
                  label="GST Tracker"
                  icon={<Receipt className="h-5 w-5" />}
                  active={activeTab === "gst-tracker"}
                  onClick={setActiveTab}
                />
                <NavButton
                  id="reports"
                  label="Reports"
                  icon={<BarChart3 className="h-5 w-5" />}
                  active={activeTab === "reports"}
                  onClick={setActiveTab}
                />
                <NavButton
                  id="ledger"
                  label="Ledger Management"
                  icon={<BookOpen className="h-5 w-5" />}
                  active={activeTab === "ledger"}
                  onClick={setActiveTab}
                />
                <NavButton
                  id="subscription"
                  label="Subscription"
                  icon={<CreditCard className="h-5 w-5" />}
                  active={activeTab === "subscription"}
                  onClick={setActiveTab}
                />
                <NavButton
                  id="settings"
                  label="Company Settings"
                  icon={<Settings className="h-6 w-6" />}
                  active={activeTab === "settings"}
                  onClick={setActiveTab}
                />
                </nav>
              </div>
              
              {/* Bottom section with Company Selector and Sign Out */}
              <div className="mt-6 pt-6 border-t border-border">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">Company</label>
                    <select
                      value={selectedCompany?.id || ""}
                      onChange={(e) => {
                        const company = companies.find(
                          (c) => c.id === parseInt(e.target.value)
                        );
                        setSelectedCompany(company, user?.id);
                      }}
                      className="w-full border border-input rounded-md px-3 py-2 bg-background text-foreground text-sm"
                    >
                      <option value="">Select Company</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.company_name}
                        </option>
                      ))}
                    </select>
                    {companies.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {companies.map((company) => (
                          <div
                            key={company.id}
                            className="flex items-center justify-between p-2 bg-muted/50 rounded-md hover:bg-muted transition-colors"
                          >
                            <span className="text-sm text-foreground truncate flex-1">
                              {company.company_name}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setCompanyToDelete(company);
                                setShowDeleteConfirm(true);
                              }}
                              title={`Delete ${company.company_name}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {selectedCompany && (
                    <Button
                      onClick={() => setShowImportModal(true)}
                      className="w-full bg-success text-success-foreground hover:bg-success/90"
                      size="sm"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Import Data
                    </Button>
                  )}
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleSignOut}
                    className="w-full text-muted-foreground hover:text-foreground justify-start"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              </div>
            </div>

            {/* Main Content */}
          <div className="flex-1">
            {!selectedCompany ? (
              <div className="bg-card rounded-lg shadow-sm p-8 text-center border border-border">
                <div className="text-muted-foreground text-6xl mb-4">
                  <Building className="h-16 w-16 mx-auto" />
                </div>
                <h2 className="text-xl font-semibold text-card-foreground mb-2">
                  Select a Company
                </h2>
                <p className="text-muted-foreground mb-4">
                  Choose a company from the dropdown above to start managing
                  inventory
                </p>
                <Button 
                  onClick={() => setShowAddCompanyDialog(true)}
                  className="bg-primary text-primary-foreground px-6 py-2 rounded-md hover:bg-primary/90 transition-colors"
                >
                  Add Your First Company
                </Button>
              </div>
            ) : (
              <>
                {/* Dashboard Tab */}
                {activeTab === "dashboard" && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold text-foreground">
                        Dashboard - {selectedCompany.company_name}
                      </h2>
                      <button
                        onClick={loadDashboardData}
                        className="bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:bg-secondary/90 flex items-center gap-2 transition-colors"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                      </button>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <StatCard
                        title="Total Products"
                        value={dashboardData.totalProducts}
                        icon={<Package className="h-6 w-6" />}
                        variant="primary"
                      />
                      <StatCard
                        title="Low Stock Items"
                        value={dashboardData.lowStockItems}
                        icon={<Package className="h-6 w-6" />}
                        variant="warning"
                      />
                      <StatCard
                        title="Pending POs"
                        value={dashboardData.pendingPOs}
                        icon={<ShoppingCart className="h-6 w-6" />}
                        variant="info"
                      />
                      <StatCard
                        title="Total Invoices"
                        value={dashboardData.totalInvoices}
                        icon={<FileText className="h-6 w-6" />}
                        variant="success"
                      />
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-card rounded-lg shadow-sm p-6 border border-border">
                      <h3 className="text-lg font-semibold text-card-foreground mb-4">
                        Quick Actions
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <button
                          onClick={() => setActiveTab("products")}
                          className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center hover:bg-primary/20 transition-colors group"
                        >
                          <Plus className="h-8 w-8 text-primary mx-auto mb-2 group-hover:scale-110 transition-transform" />
                          <p className="text-primary font-medium">Add Product</p>
                        </button>
                        <button
                          onClick={() => setActiveTab("purchase-orders")}
                          className="bg-success/10 border border-success/20 rounded-lg p-4 text-center hover:bg-success/20 transition-colors group"
                        >
                          <ShoppingCart className="h-8 w-8 text-success mx-auto mb-2 group-hover:scale-110 transition-transform" />
                          <p className="text-success font-medium">Create PO</p>
                        </button>
                        <button
                          onClick={() => setActiveTab("stock-take")}
                          className="bg-info/10 border border-info/20 rounded-lg p-4 text-center hover:bg-info/20 transition-colors group"
                        >
                          <Warehouse className="h-8 w-8 text-info mx-auto mb-2 group-hover:scale-110 transition-transform" />
                          <p className="text-info font-medium">Stock Take</p>
                        </button>
                        <button
                          onClick={() => setActiveTab("invoices")}
                          className="bg-warning/10 border border-warning/20 rounded-lg p-4 text-center hover:bg-warning/20 transition-colors group"
                        >
                          <FileText className="h-8 w-8 text-warning mx-auto mb-2 group-hover:scale-110 transition-transform" />
                          <p className="text-warning font-medium">New Invoice</p>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lazy loaded components */}
                <Suspense fallback={
                  <div className="bg-card rounded-lg shadow-sm p-8 text-center border border-border">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading...</p>
                  </div>
                }>
                  {activeTab === "gst-calculator" && <GSTCalculator />}
                  {activeTab === "gst-tracker" && <GSTTracker />}
                  {activeTab === "reports" && <ReportsManager />}
                  {activeTab === "ledger" && <LedgerManager />}
                  {activeTab === "products" && <ProductsManager />}
                  {activeTab === "stock-take" && <StockTakeManager />}
                  {activeTab === "purchase-orders" && <PurchaseOrderManager />}
                  {activeTab === "invoices" && <InvoiceManager />}
                  {activeTab === "suppliers" && <SuppliersManager />}
                  {activeTab === "subscription" && <SubscriptionManager />}
                  {activeTab === "settings" && <CompanySettings />}
                </Suspense>

                {/* Other Tabs - Placeholder for now */}
                {!["dashboard", "gst-calculator", "gst-tracker", "reports", "ledger", "products", "stock-take", "purchase-orders", "invoices", "suppliers", "subscription", "settings"].includes(activeTab) && (
                  <div className="bg-card rounded-lg shadow-sm p-8 text-center border border-border">
                    <div className="text-muted-foreground text-6xl mb-4">
                      <Package className="h-16 w-16 mx-auto" />
                    </div>
                    <h2 className="text-xl font-semibold text-card-foreground mb-2">
                      {activeTab.charAt(0).toUpperCase() +
                        activeTab.slice(1).replace("-", " ")}{" "}
                      Module
                    </h2>
                    <p className="text-muted-foreground">
                      This module is being built. Click on Dashboard to see
                      available features.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
