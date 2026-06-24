import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft, 
  Trash2, 
  Shield, 
  Mail, 
  AlertTriangle,
  CheckCircle,
  Database,
  FileText,
  Users,
  Package,
  Receipt,
  Building2,
  Info
} from 'lucide-react';
import { buildSupportMailtoUrl, SUPPORT_EMAIL } from '@/lib/supportEmail';

const AccountDeletion = () => {
  const navigate = useNavigate();
  const accountDeletionMailto = buildSupportMailtoUrl('account_deletion');
  const supportMailto = buildSupportMailtoUrl('support');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="text-white/80 hover:text-white mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-gradient-to-br from-red-500 via-red-600 to-orange-600 p-3 rounded-xl">
              <Trash2 className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-4xl font-black text-white">Account Deletion Request</h1>
          </div>
          <p className="text-white/70 text-lg">
            Request to delete your account and associated data
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Important Notice */}
          <Alert className="bg-red-500/10 border-red-500/50 text-white">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertDescription className="font-semibold">
              Account deletion is permanent and cannot be undone. All your data will be permanently deleted.
            </AlertDescription>
          </Alert>

          {/* How to Request Deletion */}
          <Card className="bg-slate-900/60 backdrop-blur-xl border border-white/10">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-primary/20 p-2 rounded-lg">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-2xl font-bold text-white">
                  How to Request Account Deletion
                </CardTitle>
              </div>
              <CardDescription className="text-white/70 text-base">
                Follow these steps to request deletion of your account and all associated data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-white/90">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center font-bold text-white">
                      1
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold mb-2">Contact Our Support Team</p>
                    <p className="text-white/80 leading-relaxed">
                      Send an email to our support team at{' '}
                      <a 
                        href={accountDeletionMailto}
                        className="text-primary hover:underline font-semibold"
                      >
                        {SUPPORT_EMAIL}
                      </a>
                      {' '}with the subject line "Account Deletion Request"
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center font-bold text-white">
                      2
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold mb-2">Provide Your Account Information</p>
                    <p className="text-white/80 leading-relaxed">
                      Include the following information in your email:
                    </p>
                    <ul className="list-disc list-inside mt-2 space-y-1 text-white/80 ml-4">
                      <li>Your registered email address</li>
                      <li>Your full name (as registered)</li>
                      <li>Confirmation that you want to delete your account</li>
                    </ul>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center font-bold text-white">
                      3
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold mb-2">Verification Process</p>
                    <p className="text-white/80 leading-relaxed">
                      Our team will verify your identity and process your deletion request within 7-14 business days.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center font-bold text-white">
                      4
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold mb-2">Confirmation</p>
                    <p className="text-white/80 leading-relaxed">
                      You will receive a confirmation email once your account and all associated data have been permanently deleted.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10">
                <Button
                  asChild
                  className="w-full bg-gradient-to-r from-primary via-blue-500 to-purple-600 hover:from-primary/90 hover:via-blue-600 hover:to-purple-700"
                >
                  <a href={accountDeletionMailto}>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Deletion Request Email
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* What Data Will Be Deleted */}
          <Card className="bg-slate-900/60 backdrop-blur-xl border border-white/10">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-red-500/20 p-2 rounded-lg">
                  <Database className="h-5 w-5 text-red-400" />
                </div>
                <CardTitle className="text-2xl font-bold text-white">
                  Data That Will Be Deleted
                </CardTitle>
              </div>
              <CardDescription className="text-white/70 text-base">
                The following data will be permanently deleted when you request account deletion
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50">
                  <Users className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">User Profile</p>
                    <p className="text-sm text-white/70">Account information, email, name</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50">
                  <Building2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Company Information</p>
                    <p className="text-sm text-white/70">All company profiles and settings</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50">
                  <Package className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Products & Inventory</p>
                    <p className="text-sm text-white/70">All products and inventory data</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50">
                  <Receipt className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Invoices & Orders</p>
                    <p className="text-sm text-white/70">All invoices and purchase orders</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50">
                  <Users className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Suppliers & Customers</p>
                    <p className="text-sm text-white/70">All business entity records</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50">
                  <FileText className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Financial Records</p>
                    <p className="text-sm text-white/70">Ledgers, transactions, and reports</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Retention Policy */}
          <Card className="bg-slate-900/60 backdrop-blur-xl border border-white/10">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-blue-500/20 p-2 rounded-lg">
                  <Info className="h-5 w-5 text-blue-400" />
                </div>
                <CardTitle className="text-2xl font-bold text-white">
                  Data Retention & Deletion Timeline
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-white/90">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Processing Time</p>
                    <p className="text-white/80 text-sm">
                      Account deletion requests are processed within 7-14 business days after verification.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Immediate Deletion</p>
                    <p className="text-white/80 text-sm">
                      Once processed, all your data is permanently deleted from our systems with no recovery option.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">No Data Retention</p>
                    <p className="text-white/80 text-sm">
                      We do not retain any of your personal data after account deletion, except as required by law (e.g., financial records for tax purposes may be retained as per legal requirements).
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alternative: Support Form */}
          <Card className="bg-slate-900/60 backdrop-blur-xl border border-white/10">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-primary/20 p-2 rounded-lg">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-2xl font-bold text-white">
                  Alternative: Use Support Form
                </CardTitle>
              </div>
              <CardDescription className="text-white/70 text-base">
                You can also use our support form to request account deletion
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => navigate('/auth?view=support')}
                variant="outline"
                className="w-full border-primary/50 text-primary hover:bg-primary/10"
              >
                <Mail className="h-4 w-4 mr-2" />
                Open contact support
              </Button>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card className="bg-gradient-to-br from-primary/10 via-blue-500/10 to-purple-600/10 backdrop-blur-xl border border-primary/30">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <Shield className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="font-bold text-white mb-2">Need Help?</h3>
                  <p className="text-white/80 text-sm mb-3">
                    If you have questions about account deletion or need assistance, please contact our support team.
                  </p>
                  <div className="flex items-center gap-2 text-primary">
                    <Mail className="h-4 w-4" />
                    <a 
                      href={supportMailto}
                      className="hover:underline font-semibold"
                    >
                      {SUPPORT_EMAIL}
                    </a>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AccountDeletion;








