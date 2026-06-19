import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { SubscriptionProvider } from "@/hooks/useSubscription";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import Policy from "./pages/Policy";
import Terms from "./pages/Terms";
import Disclaimer from "./pages/Disclaimer";
import RefundPolicy from "./pages/RefundPolicy";
import CookieNotice from "./pages/CookieNotice";
import AccountDeletion from "./pages/AccountDeletion";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentFailure from "./pages/PaymentFailure";
import { PaymentRequired } from "@/components/subscription/PaymentRequired";
import { WebAccessBlocked } from "@/components/subscription/WebAccessBlocked";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const {
    hasWebAccess,
    isFreeMobile,
    isPaidPlan,
    isExpired,
    loading: subscriptionLoading,
    daysRemaining,
    planId,
  } = useSubscription();
  const location = useLocation();
  
  // Show loading while checking authentication
  if (authLoading || subscriptionLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  // Redirect to landing if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  
  const searchParams = new URLSearchParams(location.search);
  const isSubscriptionPage =
    location.pathname === '/dashboard' && searchParams.get('tab') === 'subscription';
  
  if (!isSubscriptionPage && !hasWebAccess) {
    // Free mobile / no paid plan — web is not included
    if (isFreeMobile || !isPaidPlan) {
      return <WebAccessBlocked />;
    }

    // Paid plan expired — prompt renewal via mobile app
    if (isPaidPlan && isExpired) {
      return <PaymentRequired daysRemaining={daysRemaining} planId={planId} />;
    }

    return <WebAccessBlocked />;
  }
  
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider delayDuration={150}>
      <Toaster />
      <Sonner />
      <CompanyProvider>
        <SubscriptionProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/landing" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/account-deletion" element={<AccountDeletion />} />
            <Route path="/policy" element={<Policy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/disclaimer" element={<Disclaimer />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/cookie-notice" element={<CookieNotice />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/payment-failure" element={<PaymentFailure />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            } />
            <Route path="/" element={<Landing />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            {/* This is the test for commits */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </SubscriptionProvider>
      </CompanyProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
