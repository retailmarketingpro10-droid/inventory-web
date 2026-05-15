import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, Database, Lock, Eye, Users, FileText, CreditCard, Mail, Globe, Smartphone, Cloud } from 'lucide-react';

const Policy = () => {
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
              <Shield className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-4xl font-black text-white">Privacy Policy</h1>
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
              Inventory by RetailMarketingPro ("we", "us", "our") operates the website inventory.retailmarketingpro.in and its associated mobile and web applications ("Service"). We are committed to protecting your privacy and being transparent about how your information is used.
            </p>
          </section>

          <div className="border-t border-white/10 pt-8"></div>

          {/* Section 1: Information We Collect */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">1. Information We Collect</h2>
            </div>
            <div className="pl-11 space-y-4">
              <p className="leading-relaxed">
                We only collect minimal information necessary to provide the Service:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Business type</li>
                <li>Name of person in charge</li>
                <li>Contact details (phone number and/or email address)</li>
              </ul>

              <div className="mt-6 space-y-4">
                <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Smartphone className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-lg">Mobile App Data:</h3>
                  </div>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>The mobile application stores all inventory and operational data locally on the user's device.</li>
                    <li>This data is never uploaded, shared, synced, or transferred to our servers unless the user explicitly chooses to use the web version.</li>
                  </ul>
                </div>

                <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Cloud className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-lg">Web Application Data:</h3>
                  </div>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>The web version stores data on our secure cloud servers.</li>
                    <li>Users have full control to add, edit, download, or delete their data at any time.</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: How We Use Your Information */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Eye className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">2. How We Use Your Information</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                We use your contact and business details only for:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Managing your account</li>
                <li>Providing customer support</li>
                <li>Sending service updates or renewal reminders</li>
                <li>Maintaining service security</li>
              </ul>
              <p className="leading-relaxed mt-4 font-semibold text-primary">
                We do not sell, rent, or share your information with advertisers.
              </p>
            </div>
          </section>

          {/* Section 3: User Control of Data */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Lock className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">3. User Control of Data</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                Users may delete their stored web data at any time:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>By logging in to their dashboard, or</li>
                <li>By emailing us at <a href="mailto:retailmarketingpro1.0@gmail.com" className="text-primary hover:underline">retailmarketingpro1.0@gmail.com</a></li>
              </ul>
              <p className="leading-relaxed mt-4">
                We will delete all data within 7 working days.
              </p>
            </div>
          </section>

          {/* Section 4: Data Security */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">4. Data Security</h2>
            </div>
            <div className="pl-11">
              <p className="leading-relaxed">
                We use reasonable technical and organizational measures to protect stored data. However, no system is 100% secure.
              </p>
            </div>
          </section>

          {/* Section 5: Data Sharing */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">5. Data Sharing</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                We only share data:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>If required by law</li>
                <li>With essential service providers (e.g., hosting)</li>
                <li>At the user's explicit request</li>
              </ul>
              <p className="leading-relaxed mt-4 font-semibold text-primary">
                We never share your data for marketing.
              </p>
            </div>
          </section>

          {/* Section 6: Children's Privacy */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">6. Children's Privacy</h2>
            </div>
            <div className="pl-11">
              <p className="leading-relaxed">
                The Service is intended for users 18+.
              </p>
            </div>
          </section>

          {/* Section 7: Policy Updates */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">7. Policy Updates</h2>
            </div>
            <div className="pl-11">
              <p className="leading-relaxed">
                Any changes will be posted with an updated "Last Updated" date.
              </p>
            </div>
          </section>

          <div className="border-t border-white/10 pt-8"></div>

          {/* Refund, Cancellation & Dispute Policy */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">Refund, Cancellation & Dispute Policy</h2>
            </div>
            <div className="pl-11 space-y-6">
              {/* Subsection 1 */}
              <div>
                <h3 className="font-bold text-lg mb-2">1. Annual Subscription Only</h3>
                <p className="leading-relaxed">
                  Our services are offered only on an annual subscription basis. No monthly plans or transaction-based fees.
                </p>
              </div>

              {/* Subsection 2 */}
              <div>
                <h3 className="font-bold text-lg mb-2">2. Refund Requests</h3>
                <p className="leading-relaxed">
                  Refunds may include non-refundable fees such as:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4 mt-2">
                  <li>Payment gateway charges</li>
                  <li>Third-party commissions</li>
                  <li>Processing charges</li>
                </ul>
              </div>

              {/* Subsection 3 */}
              <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                <h3 className="font-bold text-lg mb-2 text-red-400">3. Maximum Refund Liability (Top Cap)</h3>
                <p className="leading-relaxed mb-2">
                  In any case of refund, dispute, chargeback, or cancellation:
                </p>
                <p className="leading-relaxed font-bold text-lg text-red-400">
                  THE MAXIMUM CLAIMABLE AMOUNT IS INR 100 (One Hundred Rupees only).
                </p>
                <p className="leading-relaxed mt-2">
                  This applies regardless of usage duration, issues, disputes, or cancellation reasons.
                </p>
              </div>

              {/* Subsection 4 */}
              <div>
                <h3 className="font-bold text-lg mb-2">4. No Refund After Activation</h3>
                <p className="leading-relaxed">
                  Once access is activated, third‑party fee deductions prevent full refunds.
                </p>
              </div>
            </div>
          </section>

          <div className="border-t border-white/10 pt-8"></div>

          {/* Contact Information */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">Contact Information</h2>
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

export default Policy;
