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
  IndianRupee,
  TrendingUp,
  Mail,
  X,
  Trash2
} from 'lucide-react';
import { formatIndianCurrency } from '@/utils/indianBusiness';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { PayUCheckout, SecurePaymentBadge } from '@/components/subscription/PayUCheckout';

interface Subscription {
  id: string;
  subscription_type: string;
  status: string;
  amount_paid: number;
  start_date: string;
  end_date: string;
  renewal_date: string | null;
  payment_status: string;
  payment_method: string | null;
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
  const [currentTime, setCurrentTime] = useState(new Date());
  const [renewalData, setRenewalData] = useState({
    payment_method: 'payu',
    transaction_id: '',
    notes: ''
  });
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [subscriptionToCancel, setSubscriptionToCancel] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchSubscriptions();
      fetchUserCreationDate();
    }
  }, [user]);

  // Update time every minute for real-time countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Calculate subscription progress using useMemo
  // If no subscription exists, calculate based on account creation date + 11 months
  const subscriptionProgress = React.useMemo(() => {
    const today = currentTime;
    let startDate: Date;
    let endDate: Date;
    let isTrialPeriod = false;
    
    try {
      if (currentSubscription) {
        // User has a subscription - use subscription dates
        startDate = new Date(currentSubscription.start_date);
        endDate = new Date(currentSubscription.end_date);
        
        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          console.error('Invalid subscription dates:', { start_date: currentSubscription.start_date, end_date: currentSubscription.end_date });
          return null;
        }
      } else if (userCreatedAt) {
        // No subscription but account exists - calculate 11-month trial period
        startDate = new Date(userCreatedAt);
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 11); // Add 11 months for free trial
        isTrialPeriod = true;
        
        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          console.error('Invalid user creation date:', userCreatedAt);
          return null;
        }
      } else {
        // No subscription and no account creation date - can't calculate
        return null;
      }
      
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const elapsedDays = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const remainingTime = endDate.getTime() - today.getTime();
      const remainingDays = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
      const remainingHours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const remainingMinutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
      
      const progress = totalDays > 0 ? Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100)) : 0;
      
      return {
        progress,
        totalDays: Math.max(1, totalDays),
        elapsedDays: Math.max(0, elapsedDays),
        remainingDays: Math.max(0, remainingDays),
        remainingHours: Math.max(0, remainingHours),
        remainingMinutes: Math.max(0, remainingMinutes),
        isExpired: remainingTime < 0,
        isTrialPeriod,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };
    } catch (error) {
      console.error('Error calculating subscription progress:', error);
      return null;
    }
  }, [currentSubscription, currentTime, userCreatedAt]);

  // Debug logging - must be called after all hooks but before any early returns
  useEffect(() => {
    if (currentSubscription) {
      console.log('Current Subscription:', currentSubscription);
      console.log('Subscription Progress:', subscriptionProgress);
    } else {
      console.log('No current subscription found');
      console.log('All subscriptions:', subscriptions);
    }
  }, [currentSubscription, subscriptionProgress, subscriptions]);

  const fetchSubscriptions = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      // Cast to any because subscriptions table types may not be generated
      const { data, error } = await (supabase as any)
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching subscriptions:', error);
        // If it's a 406 or table doesn't exist, show user-friendly message
        if (error.code === 'PGRST301' || error.message?.includes('406')) {
          console.warn('Subscriptions table may not be accessible. Check RLS policies.');
        }
        throw error;
      }

      setSubscriptions(data || []);
      
      // Only set currentSubscription if it's active AND paid
      // Pending subscriptions should NOT be shown as active
      const activePaidSubscription = (data || []).find(
        (sub: Subscription) => sub.status === 'active' && sub.payment_status === 'paid'
      );
      
      // If no active paid subscription, set to null (will show trial period if applicable)
      setCurrentSubscription(activePaidSubscription || null);
      
      // If no subscriptions found, log for debugging
      if (!data || data.length === 0) {
        console.log('No subscriptions found for user. User may need to have a subscription created.');
      }
    } catch (error: any) {
      console.error('Failed to load subscriptions:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load subscriptions. Please refresh the page.",
        variant: "destructive"
      });
      // Set empty arrays on error
      setSubscriptions([]);
      setCurrentSubscription(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserCreationDate = async () => {
    if (!user?.id) return;

    try {
      // Get user creation date from auth.users via profiles
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('id', user.id)
        .single();

      if (error) {
        // Fallback to auth user metadata
        if (user.created_at) {
          setUserCreatedAt(user.created_at);
        }
      } else if (profile?.created_at) {
        setUserCreatedAt(profile.created_at);
      } else if (user.created_at) {
        setUserCreatedAt(user.created_at);
      }
    } catch (error) {
      console.error('Error fetching user creation date:', error);
      // Fallback to auth user metadata
      if (user.created_at) {
        setUserCreatedAt(user.created_at);
      }
    }
  };

  const handleRenewal = () => {
    // Close the renewal dialog - PayU checkout will handle payment
    setShowRenewalDialog(false);
  };

  const handlePaymentSuccess = () => {
    toast({
      title: "Payment Initiated",
      description: "Redirecting to PayU for secure payment...",
    });
    // Payment callback will be handled by the PayU verify function
  };

  const handlePaymentFailure = (error: string) => {
    toast({
      title: "Payment Error",
      description: error || "Failed to initiate payment. Please try again.",
      variant: "destructive"
    });
  };

  const handleCancelPendingSubscription = (subscriptionId: string) => {
    setSubscriptionToCancel(subscriptionId);
    setShowCancelDialog(true);
  };

  const confirmCancelSubscription = async () => {
    if (!user?.id || !subscriptionToCancel) return;

    try {
      const { data, error } = await (supabase as any)
        .from('subscriptions')
        .delete()
        .eq('id', subscriptionToCancel)
        .eq('user_id', user.id)
        .eq('status', 'pending') // Only allow deleting pending subscriptions
        .select();

      if (error) {
        console.error('Delete subscription error:', error);
        throw error;
      }

      // Check if deletion was successful
      if (!data || data.length === 0) {
        toast({
          title: "Error",
          description: "Subscription not found or cannot be deleted. It may have already been deleted or is not in pending status.",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Success",
        description: "Pending subscription cancelled successfully"
      });

      // Close dialog and reset state
      setShowCancelDialog(false);
      setSubscriptionToCancel(null);

      // Refresh subscriptions list
      await fetchSubscriptions();
    } catch (error: any) {
      console.error('Failed to cancel subscription:', error);
      let errorMessage = "Failed to cancel subscription";
      
      // Provide more specific error messages
      if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
        errorMessage = "Permission denied. Please ensure you have the correct database permissions to delete subscriptions.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'expired': return 'destructive';
      case 'pending': return 'secondary';
      case 'cancelled': return 'outline';
      default: return 'outline';
    }
  };

  const getDaysUntilExpiry = (endDate: string) => {
    const today = new Date();
    const expiry = new Date(endDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Calculate derived values (must be after all hooks)
  const daysUntilExpiry = currentSubscription ? getDaysUntilExpiry(currentSubscription.end_date) : 0;
  const isExpiringSoon = daysUntilExpiry > 0 && daysUntilExpiry <= 30;
  const isExpired = daysUntilExpiry < 0;
  const daysUntilNext = currentSubscription ? getDaysUntilExpiry(currentSubscription.end_date) : null;

  if (loading) {
    return <div className="text-center py-8">Loading subscription information...</div>;
  }

  const handleContactSupport = () => {
    const email = 'retailmarketingpro1.0@gmail.com';
    const subject = encodeURIComponent('Subscription Support Request');
    const body = encodeURIComponent(
      `Hello,\n\nI need assistance with my subscription.\n\n` +
      `Account Email: ${user?.email || 'N/A'}\n` +
      `Account Created: ${userCreatedAt ? new Date(userCreatedAt).toLocaleDateString('en-IN') : 'N/A'}\n` +
      `Current Subscription: ${currentSubscription ? `${currentSubscription.subscription_type} - ${currentSubscription.status}` : 'None'}\n\n` +
      `Please help me with:\n\n`
    );
    
    // Create mailto link
    const mailtoLink = `mailto:${email}?subject=${subject}&body=${body}`;
    
    // Try to open email client
    try {
      window.location.href = mailtoLink;
      
      // Show toast with alternative option
      setTimeout(() => {
        toast({
          title: "Email Client Opened",
          description: "If your email client didn't open, click the button below to use our support form instead.",
        });
        
        // Show additional option after a delay
        setTimeout(() => {
          if (confirm('Would you like to use our support form instead?')) {
            navigate('/auth?view=support');
          }
        }, 2000);
      }, 1000);
    } catch (error) {
      // If mailto fails, navigate to support form
      navigate('/auth?view=support');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Subscription Management</h2>
          <p className="text-muted-foreground">Manage your subscription and track yearly renewals</p>
        </div>
      </div>

      {/* Subscription Progress Bar - Prominent Display */}
      {subscriptionProgress ? (
          <Card className={`${isExpired ? 'border-destructive' : isExpiringSoon ? 'border-warning' : 'border-primary'}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Subscription Time Remaining
              </CardTitle>
              <CardDescription>
                {subscriptionProgress.isExpired 
                  ? subscriptionProgress.isTrialPeriod 
                    ? 'Your free trial period has ended. Please subscribe to continue.'
                    : 'Your subscription has expired'
                  : subscriptionProgress.isTrialPeriod
                    ? `Free trial period - Time remaining until subscription required: ${subscriptionProgress.remainingDays} days, ${subscriptionProgress.remainingHours} hours, ${subscriptionProgress.remainingMinutes} minutes`
                    : `Time remaining until next payment: ${subscriptionProgress.remainingDays} days, ${subscriptionProgress.remainingHours} hours, ${subscriptionProgress.remainingMinutes} minutes`
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 rounded-lg p-6 border-2 border-primary/20">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground mb-2">
                      {subscriptionProgress.isTrialPeriod ? 'Days Until Subscription Required' : 'Days Until Next Payment'}
                    </p>
                    <p className="text-xs text-muted-foreground mb-1">
                      {subscriptionProgress.elapsedDays} of {subscriptionProgress.totalDays} days elapsed ({Math.round(subscriptionProgress.progress)}% complete)
                      {subscriptionProgress.isTrialPeriod && ' - Free Trial Period'}
                    </p>
                  </div>
                  <div className="text-center md:text-right">
                    <div className={`text-5xl font-bold mb-1 ${isExpired ? 'text-destructive' : isExpiringSoon ? 'text-warning' : 'text-green-600'}`}>
                      {subscriptionProgress.remainingDays}
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {subscriptionProgress.remainingDays === 1 ? 'day' : 'days'} remaining
                    </p>
                    {!subscriptionProgress.isExpired && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {subscriptionProgress.remainingHours}h {subscriptionProgress.remainingMinutes}m
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="mb-4">
                  <Progress 
                    value={subscriptionProgress.progress} 
                    className={`h-6 ${isExpired ? 'bg-destructive/20' : isExpiringSoon ? 'bg-warning/20' : 'bg-primary/20'}`}
                  />
                </div>
                
                {/* Timeline */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <div>
                      <p className="font-medium text-foreground">
                        {subscriptionProgress.isTrialPeriod ? 'Account Created' : 'Start Date'}
                      </p>
                      <p>{new Date(subscriptionProgress.startDate).toLocaleDateString('en-IN', { 
                        weekday: 'short',
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <div>
                      <p className="font-medium text-foreground">
                        {subscriptionProgress.isTrialPeriod ? 'Subscription Required By' : 'Next Payment Date'}
                      </p>
                      <p>{new Date(subscriptionProgress.endDate).toLocaleDateString('en-IN', { 
                        weekday: 'short',
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}</p>
                    </div>
                  </div>
                  <div className="text-center md:text-right">
                    <p className="font-medium text-foreground">Progress</p>
                    <p className={`font-bold text-lg ${isExpired ? 'text-destructive' : isExpiringSoon ? 'text-warning' : 'text-green-600'}`}>
                      {Math.round(subscriptionProgress.progress)}%
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
      ) : null}

      {/* User Account Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Account Created</p>
              <p className="font-medium">
                {userCreatedAt 
                  ? new Date(userCreatedAt).toLocaleDateString('en-IN', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })
                  : 'N/A'
                }
              </p>
            </div>
            {currentSubscription && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Days Remaining</p>
                  <p className={`font-medium text-lg ${isExpired ? 'text-destructive' : isExpiringSoon ? 'text-warning' : 'text-green-600'}`}>
                    {daysUntilNext !== null 
                      ? `${daysUntilNext > 0 ? daysUntilNext : 0} ${daysUntilNext === 1 ? 'day' : 'days'}`
                      : 'N/A'
                    }
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Next Renewal Date</p>
                  <p className="font-medium">
                    {new Date(currentSubscription.end_date).toLocaleDateString('en-IN', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Subscription Instructions & Payment Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription Plan & Payment Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <h3 className="font-semibold text-primary mb-2">Subscription Plan Details</h3>
            <div className="space-y-2 text-sm">
              <p className="text-foreground">
                <strong>Free Trial Period:</strong> All new users receive an <strong>11-month free trial</strong> upon signup with full access to all features.
              </p>
              <p className="text-foreground">
                <strong>Annual Renewal:</strong> After the trial period expires, the subscription fee is <strong className="text-green-600">₹10 per year</strong> to continue using the service.
              </p>
              <p className="text-foreground">
                <strong>Renewal Benefits:</strong> Each renewal extends your subscription for 12 months from the renewal date, giving you continuous access to all inventory management features.
              </p>
            </div>
          </div>

          <div className="bg-muted rounded-lg p-4">
            <h3 className="font-semibold mb-3">Payment Method</h3>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>PayU (Online Payment)</span>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-card">
            <h3 className="font-semibold mb-2">Renewal Instructions</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Click the <strong>"Renew Now"</strong> button when your subscription is about to expire or has expired.</li>
              <li>Select your preferred payment method from the dropdown.</li>
              <li>Enter your transaction ID or reference number if available (optional for some payment methods).</li>
              <li>Add any additional notes about your payment if needed.</li>
              <li>Click <strong>"Confirm Renewal"</strong> to submit your renewal request.</li>
              <li>Your subscription will be activated immediately after confirmation.</li>
            </ol>
          </div>

          <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-warning mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-warning mb-1">Important Notes</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-warning/90">
                  <li>Renewal fee is ₹10 (INR) per year, payable annually after the 11-month free trial.</li>
                  <li>You will receive reminders 30 days before your subscription expires.</li>
                  <li>If your subscription expires, access will be restricted until renewal is completed.</li>
                  <li>For payment assistance or questions, contact: <strong>retailmarketingpro1.0@gmail.com</strong></li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Renewal Button - Always Visible */}
      {!isExpired && !isExpiringSoon && (
        <Card className="border-dashed border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CreditCard className="h-4 w-4" />
              Renewal - PayU Payment Gateway
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Renew your subscription using PayU payment gateway. This will create a renewal payment.
            </p>
            <Button 
              variant="outline"
              onClick={() => setShowRenewalDialog(true)}
              className="w-full"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Renew Subscription
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Current Subscription Card - Only show if payment is paid */}
      {currentSubscription && currentSubscription.payment_status === 'paid' ? (
        <Card className={isExpiringSoon || isExpired ? 'border-warning' : ''}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Current Subscription
                </CardTitle>
                <CardDescription>
                  {currentSubscription.subscription_type === 'annual' ? 'Annual Plan' : 'Monthly Plan'}
                </CardDescription>
              </div>
              <Badge variant={getStatusColor(currentSubscription.status)}>
                {currentSubscription.status.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Start Date</p>
                <p className="font-medium">{new Date(currentSubscription.start_date).toLocaleDateString('en-IN')}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">End Date</p>
                <p className="font-medium">{new Date(currentSubscription.end_date).toLocaleDateString('en-IN')}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Amount Paid</p>
                <p className="font-medium text-green-600">{formatIndianCurrency(currentSubscription.amount_paid)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Payment Status</p>
                <Badge variant={currentSubscription.payment_status === 'paid' ? 'default' : 'secondary'}>
                  {currentSubscription.payment_status.toUpperCase()}
                </Badge>
              </div>
            </div>

            {isExpired && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <p className="font-semibold">Subscription Expired</p>
                </div>
                <p className="text-sm text-destructive/80 mt-2">
                  {currentSubscription.subscription_type === 'trial' 
                    ? `Your 11-month free trial expired on ${new Date(currentSubscription.end_date).toLocaleDateString('en-IN')}. Please renew to continue using the service.`
                    : `Your subscription expired on ${new Date(currentSubscription.end_date).toLocaleDateString('en-IN')}. Please renew to continue using the service.`
                  }
                </p>
                <Button 
                  className="mt-4"
                  onClick={() => setShowRenewalDialog(true)}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Renew Now (₹10)
                </Button>
              </div>
            )}

            {isExpiringSoon && !isExpired && (
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-warning">
                  <Clock className="h-5 w-5" />
                  <p className="font-semibold">
                    {currentSubscription.subscription_type === 'trial' 
                      ? 'Free Trial Ending Soon' 
                      : 'Renewal Due Soon'
                    }
                  </p>
                </div>
                <p className="text-sm text-warning/80 mt-2">
                  {currentSubscription.subscription_type === 'trial' 
                    ? `Your 11-month free trial expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}. Renew now for ₹10 annually to continue using the service.`
                    : `Your subscription expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}. Renew now to continue uninterrupted service.`
                  }
                </p>
                <Button 
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowRenewalDialog(true)}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Renew Now (₹10)
                </Button>
              </div>
            )}

            {!isExpiringSoon && !isExpired && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <p className="text-sm">
                    {currentSubscription.subscription_type === 'trial' 
                      ? `Free Trial Active - ${daysUntilExpiry} days remaining`
                      : `Active - ${daysUntilExpiry} days remaining`
                    }
                  </p>
                </div>
                {currentSubscription.subscription_type === 'trial' && (
                  <p className="text-xs text-muted-foreground">
                    After trial expires, renewal fee is ₹10 annually
                  </p>
                )}
                
                {/* Renewal Button */}
                <div className="mt-4 pt-4 border-t border-dashed">
                  <Button 
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRenewalDialog(true)}
                    className="w-full"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Renew Subscription
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : currentSubscription && currentSubscription.payment_status === 'pending' ? (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertCircle className="h-5 w-5" />
              Payment Pending
            </CardTitle>
            <CardDescription>
              Your subscription payment is being processed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
              <div className="flex items-center gap-2 text-warning mb-2">
                <Clock className="h-5 w-5" />
                <p className="font-semibold">Payment Pending</p>
              </div>
              <p className="text-sm text-warning/90 mb-3">
                Your subscription payment is pending. Please complete the payment to activate your subscription.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transaction ID:</span>
                  <span className="font-mono text-xs">{currentSubscription.transaction_id || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-bold">{formatIndianCurrency(currentSubscription.amount_paid)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Method:</span>
                  <span className="uppercase">{currentSubscription.payment_method || 'N/A'}</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              If you have already completed the payment, please wait a few moments for it to be processed. 
              If the issue persists, contact support at retailmarketingpro1.0@gmail.com
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Current Subscription
            </CardTitle>
            <CardDescription>No active subscription found</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Payment Information for Users Without Subscription */}
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-primary">
                <CreditCard className="h-5 w-5" />
                Subscription Payment Information
              </h3>
              <div className="space-y-4">
                <div className="bg-card border-2 border-primary/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-2">Annual Subscription Fee</p>
                  <p className="text-4xl font-bold text-primary mb-1">{formatIndianCurrency(10)}</p>
                  <p className="text-xs text-muted-foreground">Payable after 11-month free trial expires</p>
                </div>

                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Payment Method
                  </h4>
                  <div className="flex items-center gap-2 bg-card border rounded-lg p-3">
                    <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <span>PayU (Online Payment)</span>
                  </div>
                </div>

                <div className="bg-card border rounded-lg p-4">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    Contact for Payment Assistance
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/20 rounded-full p-2">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">Email</p>
                        <a 
                          href="mailto:retailmarketingpro1.0@gmail.com" 
                          className="font-medium text-primary hover:underline"
                        >
                          retailmarketingpro1.0@gmail.com
                        </a>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-primary/20">
                      <p className="text-sm text-muted-foreground">
                        For payment queries, bank details, UPI ID, or any subscription-related assistance, please contact us via email.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {userCreatedAt && (
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Account Created</p>
                <p className="font-medium">
                  {new Date(userCreatedAt).toLocaleDateString('en-IN', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Subscription History */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription History</CardTitle>
          <CardDescription>View all your subscription records</CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No subscription history found</p>
          ) : (
            <div className="space-y-4">
              {subscriptions.map((sub) => (
                <div key={sub.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={getStatusColor(sub.status)}>
                          {sub.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {sub.subscription_type} • {formatIndianCurrency(sub.amount_paid)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Start</p>
                          <p>{new Date(sub.start_date).toLocaleDateString('en-IN')}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">End</p>
                          <p>{new Date(sub.end_date).toLocaleDateString('en-IN')}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Payment</p>
                          <p>{sub.payment_method || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Status</p>
                          <Badge variant={sub.payment_status === 'paid' ? 'default' : 'secondary'} className="text-xs">
                            {sub.payment_status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    {/* Cancel button for pending subscriptions */}
                    {sub.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelPendingSubscription(sub.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                        title="Cancel pending subscription"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Renewal Dialog */}
      <Dialog open={showRenewalDialog} onOpenChange={setShowRenewalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renew Subscription</DialogTitle>
            <DialogDescription>
              Annual renewal fee: <span className="font-bold text-lg">{formatIndianCurrency(10)}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Payment Method</Label>
              <Select 
                value={renewalData.payment_method}
                onValueChange={(value) => setRenewalData(prev => ({ ...prev, payment_method: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payu">PayU (Online Payment)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {renewalData.payment_method !== 'payu' && (
              <div>
                <Label>Transaction ID / Reference (Optional)</Label>
                <Input
                  value={renewalData.transaction_id}
                  onChange={(e) => setRenewalData(prev => ({ ...prev, transaction_id: e.target.value }))}
                  placeholder="Enter transaction reference"
                />
              </div>
            )}
            {renewalData.payment_method === 'payu' && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <CreditCard className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-sm mb-1">Secure Online Payment</p>
                    <p className="text-xs text-muted-foreground">
                      You will be redirected to PayU payment gateway to complete your payment securely. 
                      All major credit/debit cards, UPI, net banking, and wallets are accepted.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={renewalData.notes}
                onChange={(e) => setRenewalData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm font-semibold mb-2">Renewal Summary</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Renewal Amount:</span>
                  <span className="font-bold">{formatIndianCurrency(10)}</span>
                </div>
                <div className="flex justify-between">
                  <span>New End Date:</span>
                  <span>
                    {(() => {
                      let endDate: Date;
                      if (currentSubscription) {
                        endDate = new Date(currentSubscription.end_date);
                      } else if (userCreatedAt) {
                        endDate = new Date(userCreatedAt);
                        endDate.setMonth(endDate.getMonth() + 11); // Trial end date
                      } else {
                        return 'N/A';
                      }
                      endDate.setFullYear(endDate.getFullYear() + 1);
                      return endDate.toLocaleDateString('en-IN');
                    })()}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex justify-center">
                <SecurePaymentBadge />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowRenewalDialog(false)}>
                  Cancel
                </Button>
                <PayUCheckout
                  amount={10}
                  productInfo="Inventory Manager Annual Subscription"
                  subscriptionType="annual"
                  onSuccess={handlePaymentSuccess}
                  onFailure={handlePaymentFailure}
                  buttonText="Pay ₹10 Now"
                  className="bg-primary hover:bg-primary/90"
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Pending Subscription Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-6 w-6 text-destructive" />
              </div>
              <AlertDialogTitle className="text-xl">Cancel Pending Subscription</AlertDialogTitle>
            </div>
          </AlertDialogHeader>
          <div className="py-4">
            <AlertDialogDescription className="mb-4">
              Are you sure you want to cancel this pending subscription?
            </AlertDialogDescription>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive mb-1">
                    This action cannot be undone
                  </p>
                  <p className="text-xs text-muted-foreground">
                    The pending subscription will be permanently deleted from your account. 
                    If you've already made a payment, please contact support instead.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowCancelDialog(false);
              setSubscriptionToCancel(null);
            }}>
              Keep Subscription
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelSubscription}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Cancel Subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

