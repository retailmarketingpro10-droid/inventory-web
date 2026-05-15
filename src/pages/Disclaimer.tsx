import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  AlertTriangle, 
  FileX, 
  Database, 
  Wifi, 
  Link as LinkIcon, 
  TrendingDown, 
  Package, 
  CreditCard, 
  Mail, 
  Globe,
  Shield,
  AlertCircle
} from 'lucide-react';

const Disclaimer = () => {
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
              <AlertTriangle className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-4xl font-black text-white">Disclaimer</h1>
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
              Inventory by RetailMarketingPro ("we", "us", "our") provides software tools, mobile apps, and web-based services designed to help businesses manage inventory, billing, and related operations. By using our Service, you acknowledge and agree to the following:
            </p>
          </section>

          <div className="border-t border-white/10 pt-8"></div>

          {/* Section 1: No Guarantees of Accuracy */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <AlertCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">1. No Guarantees of Accuracy</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                While we aim to provide reliable and accurate software, we do not guarantee that:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>The data entered by users is correct</li>
                <li>Reports, summaries, or calculations are always accurate</li>
                <li>The app will function error-free at all times</li>
                <li>Third-party integrations (if any) will work without interruption</li>
              </ul>
              <p className="leading-relaxed mt-4 font-semibold">
                All business data, values, entries, and outputs are fully the user's responsibility.
              </p>
            </div>
          </section>

          {/* Section 2: No Financial, Legal, or Professional Advice */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <FileX className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">2. No Financial, Legal, or Professional Advice</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                Our software does not provide:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Financial advice</li>
                <li>Business advice</li>
                <li>Legal or tax advice</li>
                <li>Investment guidance</li>
              </ul>
              <p className="leading-relaxed mt-4 font-semibold">
                Any decisions made using data from our platform are the sole responsibility of the user.
              </p>
            </div>
          </section>

          {/* Section 3: User Responsibility for Data */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">3. User Responsibility for Data</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                Users are fully responsible for:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Entering correct data</li>
                <li>Maintaining updated business information</li>
                <li>Backing up mobile app data stored locally</li>
                <li>Preventing unauthorized access to their own devices and accounts</li>
              </ul>
              <p className="leading-relaxed mt-4 font-semibold text-primary">
                We are not responsible for any data loss caused by user mistakes, device damage, app deletion, phone reset, or local storage issues.
              </p>
            </div>
          </section>

          {/* Section 4: System Availability */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Wifi className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">4. System Availability</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                We strive to provide stable uptime, but we do not guarantee:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>24/7 service availability</li>
                <li>Error-free performance</li>
                <li>Zero downtime</li>
                <li>No interruptions due to server maintenance, outages, or third-party failures</li>
              </ul>
              <p className="leading-relaxed mt-4">
                Temporary downtime may occur due to updates, maintenance, or factors beyond our control.
              </p>
            </div>
          </section>

          {/* Section 5: Third-Party Services */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <LinkIcon className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">5. Third-Party Services</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                Any third-party services used by the platform (such as hosting, payment gateways, analytics, or integrations) are operated independently.
              </p>
              <p className="leading-relaxed mt-4">
                We are not responsible for:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Third-party outages</li>
                <li>Third-party data breaches</li>
                <li>Delays caused by external systems</li>
                <li>Fees charged by third parties</li>
              </ul>
            </div>
          </section>

          {/* Section 6: No Liability for Business Loss */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <TrendingDown className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">6. No Liability for Business Loss</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                We are not liable for:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Business losses</li>
                <li>Revenue loss</li>
                <li>Missed sales</li>
                <li>Damages caused by incorrect data entry</li>
                <li>Damages from app downtime or errors</li>
              </ul>
              <p className="leading-relaxed mt-4 font-semibold">
                The platform is a tool; the business decisions and outcomes belong to the user.
              </p>
            </div>
          </section>

          {/* Section 7: Software Provided "As-Is" */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">7. Software Provided "As-Is"</h2>
            </div>
            <div className="pl-11 space-y-2">
              <p className="leading-relaxed">
                The Service is provided on an "as-is" and "as-available" basis without warranties of any kind, expressed or implied.
              </p>
              <p className="leading-relaxed">
                We reserve the right to modify, update, or discontinue parts of the Service at any time.
              </p>
            </div>
          </section>

          {/* Section 8: Maximum Liability */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">8. Maximum Liability</h2>
            </div>
            <div className="pl-11 space-y-4">
              <p className="leading-relaxed">
                In any case of dispute, claim, or issue arising from use of the Service:
              </p>
              <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                <p className="leading-relaxed font-bold text-lg text-red-400 mb-2">
                  Our maximum liability is limited to INR 100 (One Hundred Rupees Only).
                </p>
              </div>
              <p className="leading-relaxed">
                This applies to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Refunds</li>
                <li>Chargebacks</li>
                <li>Losses</li>
                <li>Claims</li>
                <li>Damages</li>
              </ul>
            </div>
          </section>

          <div className="border-t border-white/10 pt-8"></div>

          {/* Section 9: Contact */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white">9. Contact</h2>
            </div>
            <div className="pl-11">
              <div className="bg-primary/10 rounded-lg border border-primary/20 p-6 space-y-3">
                <p className="leading-relaxed mb-4">
                  For questions regarding this Disclaimer, please contact:
                </p>
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

export default Disclaimer;

