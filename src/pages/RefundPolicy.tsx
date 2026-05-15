import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  CreditCard, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Ban, 
  MessageCircle, 
  Mail, 
  Globe,
  Calendar,
  Shield
} from 'lucide-react';

const RefundPolicy = () => {
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
              <CreditCard className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-4xl font-black text-white">Refund, Cancellation & Dispute Policy</h1>
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
              This Refund & Cancellation Policy applies to all users of Inventory by RetailMarketingPro ("we", "us", "our") operating at inventory.retailmarketingpro.in.
            </p>
          </section>

          <div className="border-t border-white/10 pt-8"></div>

          {/* Section 1: Annual Subscription Only */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">1. Annual Subscription Only</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                Our services are provided strictly on an annual subscription basis. We do not offer monthly billing, partial subscriptions, or per-transaction fees.
              </p>
            </div>
          </section>

          {/* Section 2: Refund Eligibility */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">2. Refund Eligibility</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                Refunds may be requested only under the following conditions:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Incorrect duplicate payment.</li>
                <li>Service activation failure due to technical issues on our side.</li>
                <li>Order placed by mistake and reported within 24 hours.</li>
              </ul>
            </div>
          </section>

          {/* Section 3: Non‑Refundable Charges */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <XCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">3. Non‑Refundable Charges</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                All refunds include unavoidable deductions such as:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Payment gateway charges</li>
                <li>Processing fees</li>
                <li>Third‑party commissions (non-refundable)</li>
              </ul>
              <p className="leading-relaxed mt-4">
                These fees are imposed by external providers and cannot be reversed.
              </p>
            </div>
          </section>

          {/* Section 4: Maximum Refund Liability (Top Cap) */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">4. Maximum Refund Liability (Top Cap)</h2>
            </div>
            <div className="pl-11 space-y-4">
              <p className="leading-relaxed">
                For any refund request, dispute, cancellation, or chargeback:
              </p>
              <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                <p className="leading-relaxed font-bold text-lg text-red-400 mb-2">
                  THE MAXIMUM AMOUNT A USER CAN CLAIM IS INR 100 (ONE HUNDRED RUPEES ONLY).
                </p>
              </div>
              <p className="leading-relaxed">
                This limit applies regardless of:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Usage time</li>
                <li>Reason for cancellation</li>
                <li>Dispute nature</li>
                <li>Technical errors</li>
                <li>Subscription period remaining</li>
              </ul>
              <p className="leading-relaxed mt-4 font-semibold">
                By purchasing the annual plan, the user agrees to this cap.
              </p>
            </div>
          </section>

          {/* Section 5: No Full Refund After Service Activation */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">5. No Full Refund After Service Activation</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                Once the subscription is activated and access is granted:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Full refunds are NOT provided.</li>
                <li>Third‑party fee deductions prevent complete reversals.</li>
                <li>The service is considered delivered and used from the moment access is given.</li>
              </ul>
            </div>
          </section>

          {/* Section 6: Cancellation Policy */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Ban className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">6. Cancellation Policy</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                Users may cancel their subscription anytime, but:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Cancellation does NOT guarantee a refund.</li>
                <li>Subscription remains active until the end of the billing cycle.</li>
              </ul>
            </div>
          </section>

          {/* Section 7: Disputes & Chargebacks */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <MessageCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">7. Disputes & Chargebacks</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                If a dispute or chargeback is initiated:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Investigation may take 7–14 working days.</li>
                <li>Our maximum liability remains INR 100.</li>
                <li>False or fraudulent disputes may result in account termination.</li>
              </ul>
            </div>
          </section>

          <div className="border-t border-white/10 pt-8"></div>

          {/* Section 8: Contact for Refunds & Support */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">8. Contact for Refunds & Support</h2>
            </div>
            <div className="pl-11">
              <div className="bg-primary/10 rounded-lg border border-primary/20 p-6 space-y-3">
                <p className="leading-relaxed mb-4">
                  For refund requests, cancellation queries, or disputes:
                </p>
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white/70 mb-1">Email:</p>
                    <a href="mailto:retailmarketingpro1.0@gmail.com" className="text-primary hover:underline">
                      retailmarketingpro1.0@gmail.com
                    </a>
                  </div>
                </div>
                <p className="leading-relaxed mt-4">
                  We aim to respond within 48–72 hours.
                </p>
              </div>
            </div>
          </section>

          {/* Footer Section */}
          <div className="border-t border-white/10 pt-8">
            <div className="text-center space-y-2">
              <p className="font-bold text-lg">RetailMarketingPro</p>
              <a 
                href="https://inventory.retailmarketingpro.in" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-primary hover:underline flex items-center justify-center gap-2"
              >
                <Globe className="h-4 w-4" />
                inventory.retailmarketingpro.in
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RefundPolicy;

