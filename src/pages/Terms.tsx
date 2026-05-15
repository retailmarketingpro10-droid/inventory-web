import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  FileText, 
  Users, 
  Package, 
  Shield, 
  Database, 
  CreditCard, 
  AlertTriangle, 
  MessageCircle, 
  Ban, 
  Copyright, 
  XCircle, 
  FileEdit, 
  Scale, 
  Mail, 
  Globe,
  Smartphone,
  Cloud,
  Lock,
  CheckCircle
} from 'lucide-react';

const Terms = () => {
  const navigate = useNavigate();

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
            <div className="bg-gradient-to-br from-primary via-blue-500 to-purple-600 p-3 rounded-xl">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-4xl font-black text-white">Terms & Conditions</h1>
          </div>
          <p className="text-white/70 text-lg">
            Last Updated: December 1, 2025
          </p>
        </div>

        {/* Content */}
        <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-white/10 p-8 md:p-12 space-y-8 text-white/90">
          {/* Introduction */}
          <section className="space-y-4">
            <p className="leading-relaxed">
              Welcome to Inventory by RetailMarketingPro ("we", "us", "our").
            </p>
            <p className="leading-relaxed">
              These Terms & Conditions ("Terms") govern your access to and use of our website inventory.retailmarketingpro.in, our mobile app, and all related services ("Service").
            </p>
            <p className="leading-relaxed font-semibold">
              By accessing or using our Service, you agree to these Terms.
            </p>
            <p className="leading-relaxed text-primary font-semibold">
              If you do not agree, you must stop using the Service immediately.
            </p>
          </section>

          <div className="border-t border-white/10 pt-8"></div>

          {/* Section 1: Eligibility */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">1. Eligibility</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">You must:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Be at least 18 years old</li>
                <li>Provide accurate business and contact details</li>
                <li>Use the Service only for lawful business purposes</li>
              </ul>
            </div>
          </section>

          {/* Section 2: Description of the Service */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">2. Description of the Service</h2>
            </div>
            <div className="pl-11 space-y-4">
              <p className="leading-relaxed">
                Inventory by RetailMarketingPro provides:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>A mobile application that stores all data locally on the user's device</li>
                <li>A web application that stores user data on our secure cloud</li>
                <li>Tools for managing stock, billing, customers, suppliers, and business operations</li>
              </ul>
              <p className="leading-relaxed mt-4">
                We do not access or collect user business data unless the user intentionally uses the web version.
              </p>
            </div>
          </section>

          {/* Section 3: User Responsibilities */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">3. User Responsibilities</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                By using the Service, you agree to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Keep your login credentials confidential</li>
                <li>Maintain accurate records in the system</li>
                <li>Use the platform ethically and legally</li>
                <li>Not attempt to hack, reverse-engineer, or misuse the software</li>
                <li>Ensure your device security (passwords, antivirus, etc.)</li>
              </ul>
              <p className="leading-relaxed mt-4 font-semibold">
                You are responsible for any actions taken under your account.
              </p>
            </div>
          </section>

          {/* Section 4: Data Storage & Ownership */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">4. Data Storage & Ownership</h2>
            </div>
            <div className="pl-11 space-y-2">
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>All mobile app data is stored on your device only.</li>
                <li>Web data is stored securely in our cloud server.</li>
                <li>You retain full ownership of your business data.</li>
                <li>You may delete your data anytime through the dashboard or by emailing <a href="mailto:retailmarketingpro1.0@gmail.com" className="text-primary hover:underline">retailmarketingpro1.0@gmail.com</a>.</li>
              </ul>
              <p className="leading-relaxed mt-4 font-semibold text-primary">
                We do not access, sell, or share your business data.
              </p>
            </div>
          </section>

          {/* Section 5: Subscription & Payments */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">5. Subscription & Payments</h2>
            </div>
            <div className="pl-11 space-y-2">
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>The Service works on an annual subscription model only.</li>
                <li>There are no monthly plans or commissions.</li>
                <li>Access begins immediately after payment is successful.</li>
              </ul>
            </div>
          </section>

          {/* Section 6: Refund, Cancellation & Dispute Policy */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">6. Refund, Cancellation & Dispute Policy</h2>
            </div>
            <div className="pl-11 space-y-4">
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Refunds may involve third-party gateway fees, which are not refundable.</li>
                <li>For any refund, chargeback, dispute, or cancellation:</li>
              </ul>
              <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20 mt-4">
                <p className="leading-relaxed font-bold text-lg text-red-400 mb-2">
                  The maximum amount a user can claim is INR 100 Only.
                </p>
              </div>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Once access is activated, no full refund is possible.</li>
                <li>Users agree to this limit as a condition of using the Service.</li>
              </ul>
            </div>
          </section>

          {/* Section 7: Limitations of Liability */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">7. Limitations of Liability</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                To the maximum extent permitted by law:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>We are not liable for loss of data caused by user device issues, incorrect usage, or third-party failures.</li>
                <li>We are not responsible for business losses, revenue declines, or operational impacts caused by the user's own configuration or usage.</li>
                <li>The platform is provided "as is" and "as available".</li>
              </ul>
              <p className="leading-relaxed mt-4 font-semibold">
                Our total liability is limited to INR 100, as agreed in the Refund Policy.
              </p>
            </div>
          </section>

          {/* Section 8: Support & Communication */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <MessageCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">8. Support & Communication</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                Users may contact us for:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Technical support</li>
                <li>Account issues</li>
                <li>Data deletion requests</li>
                <li>Feedback</li>
              </ul>
              <div className="mt-4 p-4 bg-primary/10 rounded-lg border border-primary/20">
                <p className="leading-relaxed mb-2">
                  <span className="font-semibold">Email:</span> <a href="mailto:retailmarketingpro1.0@gmail.com" className="text-primary hover:underline">retailmarketingpro1.0@gmail.com</a>
                </p>
                <p className="leading-relaxed">
                  We strive to respond within 48–72 hours.
                </p>
              </div>
            </div>
          </section>

          {/* Section 9: Acceptable Use Restrictions */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Ban className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">9. Acceptable Use Restrictions</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                You agree NOT to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Upload harmful scripts, malware, or viruses</li>
                <li>Misuse or overload the system</li>
                <li>Copy, clone, replicate, or redistribute our software</li>
                <li>Use the Service to conduct illegal activities</li>
                <li>Access other users' data</li>
              </ul>
              <p className="leading-relaxed mt-4 font-semibold text-red-400">
                Violation may result in immediate termination without refund.
              </p>
            </div>
          </section>

          {/* Section 10: Intellectual Property */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Copyright className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">10. Intellectual Property</h2>
            </div>
            <div className="pl-11 space-y-2">
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>The software, design, features, brand, and UI/UX belong to RetailMarketingPro.</li>
                <li>You receive a non-transferable, non-exclusive license to use the Service for your business only.</li>
              </ul>
            </div>
          </section>

          {/* Section 11: Termination */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <XCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">11. Termination</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                We may suspend or terminate your account if:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>You violate these Terms</li>
                <li>Fraud or illegal activity is suspected</li>
                <li>Payment fails or is disputed</li>
              </ul>
              <p className="leading-relaxed mt-4">
                Upon termination, data may be deleted permanently.
              </p>
            </div>
          </section>

          {/* Section 12: Modifications to the Terms */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <FileEdit className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">12. Modifications to the Terms</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                We may update these Terms at any time.
              </p>
              <p className="leading-relaxed">
                Updated versions will be posted on this page with the "Last Updated" date.
              </p>
              <p className="leading-relaxed">
                Continued use of the Service means you accept the revised Terms.
              </p>
            </div>
          </section>

          {/* Section 13: Governing Law */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Scale className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">13. Governing Law</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                These Terms are governed by the laws of India.
              </p>
              <p className="leading-relaxed">
                All disputes shall be resolved under the jurisdiction of courts located in India.
              </p>
            </div>
          </section>

          <div className="border-t border-white/10 pt-8"></div>

          {/* Section 14: Contact Information */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">14. Contact Information</h2>
            </div>
            <div className="pl-11">
              <div className="bg-primary/10 rounded-lg border border-primary/20 p-6 space-y-3">
                <div>
                  <p className="font-bold text-lg mb-2">RetailMarketingPro</p>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white/70 mb-1">Email:</p>
                    <a href="mailto:retailmarketingpro1.0@gmail.com" className="text-primary hover:underline">
                      retailmarketingpro1.0@gmail.com
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Globe className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white/70 mb-1">Website:</p>
                    <a href="https://inventory.retailmarketingpro.in" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      inventory.retailmarketingpro.in
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Terms;
