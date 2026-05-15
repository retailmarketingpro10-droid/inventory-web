import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  CreditCard, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  RefreshCw,
  Mail,
  Trash2
} from 'lucide-react';
import { formatIndianCurrency } from '@/utils/indianBusiness';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PayUCheckout, SecurePaymentBadge } from '@/components/subscription/PayUCheckout';
import { logger } from '@/lib/logger';

interface Subscription {
  id: string;
  subscription_type: string;
  subscription_status: string;
  payment_amount: number;
  start_date: string;
  end_date: string;
  renewal_date: string | null;
  payment_status: string;
  payment_gateway: string | null;
  currency: string | null;
  transaction_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const SubscriptionManager = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRenewalDialog, setShowRenewalDialog] = useState(false);
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchSubscriptions();
      fetchUserCreationDate();
    }
  }, [user]);

  const fetchSubscriptions = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubscriptions(data || []);
      const activePaidSubscription = (data || []).find(
        (sub: Subscription) => sub.subscription_status === 'active' && sub.payment_status === 'paid'
      );
      setCurrentSubscription(activePaidSubscription || null);
    } catch (error: any) {
      logger.error('Failed to load subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserCreationDate = async () => {
    if (!user?.id) return;
    try {
      const { data: profile } = await supabase.from('profiles').select('created_at').eq('id', user.id).single();
      setUserCreatedAt(profile?.created_at || user.created_at || null);
    } catch (error) {
      setUserCreatedAt(user.created_at || null);
    }
  };

  const getDaysUntilExpiry = (endDate: string) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const expiry = new Date(endDate);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysUntilExpiry = currentSubscription ? getDaysUntilExpiry(currentSubscription.end_date) : 0;
  const isExpiringSoon = daysUntilExpiry > 0 && daysUntilExpiry <= 30;
  const isExpired = daysUntilExpiry <= 0 && currentSubscription?.subscription_status === 'expired';

  const getStatusDisplay = () => {
    if (!currentSubscription) return { label: 'Pending Payment', color: 'text-yellow-600', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' };
    if (currentSubscription.subscription_status === 'expired' || daysUntilExpiry <= 0) 
      return { label: 'Expired', color: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20' };
    if (currentSubscription.payment_status === 'pending') 
      return { label: 'Pending Payment', color: 'text-yellow-600', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' };
    if (isExpiringSoon) 
      return { label: 'Expiring Soon', color: 'text-orange-600', bg: 'bg-orange-500/10', border: 'border-orange-500/20' };
    return { label: 'Active', color: 'text-green-600', bg: 'bg-green-500/10', border: 'border-green-500/20' };
  };

  const statusInfo = getStatusDisplay();

  const handleContactSupport = () => {
    navigate('/auth?view=support');
  };

  if (loading) {
    return <div className="text-center py-20">Loading your subscription details...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-4">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black tracking-tight text-foreground">
          Subscription Management
        </h2>
        <p className="text-muted-foreground font-medium">Manage your annual maintenance plan and billing</p>
      </div>

      <Card className={`overflow-hidden border-2 shadow-2xl transition-all duration-500 ${statusInfo.border}`}>
        <div className={`h-3 w-full ${statusInfo.bg.replace('/10', '')} bg-opacity-100`}></div>
        <CardHeader className="pb-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold">Annual Maintenance</CardTitle>
                <CardDescription>Validity: 1 Year</CardDescription>
              </div>
            </div>
            <Badge className={`${statusInfo.bg} ${statusInfo.color} border-none font-black px-4 py-1.5 text-xs uppercase tracking-widest`}>
              {statusInfo.label}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-8">
          {(isExpired || isExpiringSoon || !currentSubscription) && (
            <div className={`p-5 rounded-2xl flex items-start gap-4 ${statusInfo.bg} border ${statusInfo.border} animate-pulse`}>
              <AlertCircle className={`h-6 w-6 mt-0.5 ${statusInfo.color}`} />
              <div className="flex-1">
                <p className={`font-black text-lg ${statusInfo.color}`}>
                  {!currentSubscription ? 'Subscription Required' : isExpired ? 'Renewal Required' : 'Expiry Warning'}
                </p>
                <p className="text-sm font-medium opacity-80 leading-relaxed">
                  {!currentSubscription 
                    ? 'Please subscribe to the Annual Maintenance Plan to start using all features.' 
                    : isExpired 
                      ? 'Your subscription has expired. Renew now to restore access.' 
                      : `Your subscription will expire in ${daysUntilExpiry} days. Renew now to avoid interruption.`}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-8 px-2">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-black uppercase tracking-widest">Current Plan</p>
              <p className="text-lg font-bold text-foreground">Annual</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-black uppercase tracking-widest">Status</p>
              <p className={`text-lg font-bold ${statusInfo.color}`}>
                {statusInfo.label}
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-black uppercase tracking-widest">Start Date</p>
              <p className="text-lg font-bold">
                {currentSubscription ? new Date(currentSubscription.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-black uppercase tracking-widest">End Date</p>
              <p className="text-lg font-bold">
                {currentSubscription ? new Date(currentSubscription.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-black uppercase tracking-widest">Days Remaining</p>
              <p className={`text-lg font-bold ${statusInfo.color}`}>
                {daysUntilExpiry > 0 ? daysUntilExpiry : 0}
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-black uppercase tracking-widest">Amount Paid</p>
              <p className="text-lg font-bold text-foreground">
                {currentSubscription ? formatIndianCurrency((currentSubscription as any).payment_amount) : '₹0.00'}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900 shadow-inner rounded-3xl p-8 flex items-center justify-between border border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-xs text-muted-foreground font-black uppercase tracking-widest mb-2">Days Remaining</p>
              <p className={`text-6xl font-black ${statusInfo.color}`}>
                {daysUntilExpiry > 0 ? daysUntilExpiry : 0}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground font-black uppercase tracking-widest mb-2">Amount Paid</p>
              <p className="text-3xl font-black text-foreground">
                {currentSubscription ? formatIndianCurrency((currentSubscription as any).payment_amount) : '₹0.00'}
              </p>
            </div>
          </div>

          <div className="pt-2">
            <Button 
              className="w-full h-20 text-2xl font-black shadow-2xl hover:shadow-primary/40 transition-all duration-300 transform hover:scale-[1.02] bg-gradient-to-r from-primary via-blue-600 to-indigo-700 rounded-2xl active:scale-95 group"
              onClick={() => setShowRenewalDialog(true)}
            >
              <RefreshCw className="mr-4 h-8 w-8 group-hover:rotate-180 transition-transform duration-700" />
              Renew Subscription (₹10)
            </Button>
            <div className="flex justify-center mt-6">
              <SecurePaymentBadge />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed bg-transparent hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors cursor-pointer" onClick={handleContactSupport}>
        <CardContent className="p-8 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="bg-primary/10 p-4 rounded-2xl">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="text-xl font-black mb-1">Billing Support</p>
              <p className="text-muted-foreground font-medium">Have questions or need manual activation?</p>
            </div>
          </div>
          <Button variant="ghost" className="font-bold border-2 border-slate-200">Contact Team</Button>
        </CardContent>
      </Card>

      <Dialog open={showRenewalDialog} onOpenChange={setShowRenewalDialog}>
        <DialogContent className="sm:max-w-[450px] rounded-3xl border-2">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black mt-4">Subscription Renewal</DialogTitle>
            <DialogDescription className="text-lg font-medium">
              Continue your premium service for another year.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-8 py-6">
            <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-2xl border-2 border-primary/10 space-y-6">
              <div className="flex justify-between items-center text-xl">
                <span className="font-bold">Annual Maintenance</span>
                <span className="font-black text-primary">₹10.00</span>
              </div>
              <div className="space-y-3 text-sm font-medium text-muted-foreground">
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span className="text-foreground">365 Days</span>
                </div>
                <div className="flex justify-between">
                  <span>New End Date:</span>
                  <span className="text-foreground underline decoration-primary/30">
                    {(() => {
                      const baseDate = (currentSubscription && new Date(currentSubscription.end_date) > new Date()) 
                        ? new Date(currentSubscription.end_date) 
                        : new Date();
                      baseDate.setFullYear(baseDate.getFullYear() + 1);
                      return baseDate.toLocaleDateString('en-IN');
                    })()}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <PayUCheckout
                amount={10}
                productInfo="Annual Maintenance Renewal"
                subscriptionType="annual"
                buttonText="Proceed to Payment"
                className="w-full h-16 text-xl font-black rounded-2xl shadow-xl hover:shadow-primary/20"
              />
              <p className="text-center text-xs text-muted-foreground font-medium">
                You will be redirected to PayU's secure payment gateway.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubscriptionManager;
