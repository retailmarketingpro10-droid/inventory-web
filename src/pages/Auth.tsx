import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { 
  Loader2, 
  Package, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Sparkles, 
  AlertCircle, 
  ExternalLink, 
  Send,
  Warehouse,
  User,
  Phone,
  Building2,
  MessageSquare,
  ArrowRight,
  CheckCircle,
  Star,
  Zap,
  Trash2,
  Info
} from 'lucide-react';
import { toast } from 'sonner';

// Web3Forms Access Key - Get yours from https://web3forms.com
const WEB3FORMS_ACCESS_KEY = import.meta.env.VITE_WEB3FORMS_ACCESS_KEY || 'YOUR_ACCESS_KEY_HERE';
const ADMIN_EMAIL = 'retailmarketingpro1.0@gmail.com';

const Auth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Contact form states
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);
  const [contactFormData, setContactFormData] = useState({
    fullName: '',
    email: '',
    mobileNumber: '',
    businessType: '',
    message: ''
  });

  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const navigate = useNavigate();
  
  // Get view from URL params
  const [currentView, setCurrentView] = useState<'login' | 'support' | 'signup'>('login');
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view') as 'login' | 'support' | 'signup';
    if (view && ['login', 'support', 'signup'].includes(view)) {
      setCurrentView(view);
    } else {
      setCurrentView('login');
    }
  }, []);

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate('/dashboard');
      }
    };
    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate('/dashboard');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        toast.success('Successfully signed in!');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingContact(true);

    try {
      // Save to database
      const { error: dbError } = await supabase
        .from('contact_inquiries')
        .insert([{
          full_name: contactFormData.fullName,
          email: contactFormData.email,
          mobile_number: contactFormData.mobileNumber,
          business_type: contactFormData.businessType || null,
          message: contactFormData.message
        }]);

      if (dbError) throw dbError;

      // Prepare email content for admin
      const adminEmailBody = `
New Contact Form Submission

Full Name: ${contactFormData.fullName}
Email Address: ${contactFormData.email}
Mobile Number: ${contactFormData.mobileNumber}
${contactFormData.businessType ? `Business Type: ${contactFormData.businessType}\n` : ''}

Message:
${contactFormData.message}

---
This email was sent from the Inventory Migrator contact form.
      `.trim();

      // Send email to admin using Web3Forms
      try {
        const adminEmailResponse = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            access_key: WEB3FORMS_ACCESS_KEY,
            subject: `New Contact Form Submission from ${contactFormData.fullName}`,
            from_name: 'Inventory Migrator Contact Form',
            email: ADMIN_EMAIL,
            message: adminEmailBody,
            replyto: contactFormData.email,
          }),
        });

        const adminResult = await adminEmailResponse.json();
        
        if (!adminEmailResponse.ok || !adminResult.success) {
          logger.error('Admin email sending failed:', adminResult);
        }
      } catch (adminEmailErr) {
        logger.error('Error sending admin email:', adminEmailErr);
      }

      // Send confirmation email to user immediately
      try {
        const userConfirmationBody = `
Dear ${contactFormData.fullName},

Thank you for contacting us! We have received your message and will get back to you soon.

Your submission details:
- Email: ${contactFormData.email}
- Mobile: ${contactFormData.mobileNumber}
${contactFormData.businessType ? `- Business Type: ${contactFormData.businessType}\n` : ''}

Your Message:
${contactFormData.message}

Our team will review your inquiry and contact you at the earliest convenience.

Best regards,
Inventory Migrator Team
        `.trim();

        const userEmailResponse = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            access_key: WEB3FORMS_ACCESS_KEY,
            subject: 'Thank You for Contacting Us - Inventory Migrator',
            from_name: 'Inventory Migrator',
            email: contactFormData.email,
            message: userConfirmationBody,
          }),
        });

        const userResult = await userEmailResponse.json();
        
        if (userEmailResponse.ok && userResult.success) {
          toast.success('Thank you! We have sent a confirmation email to your inbox.');
        } else {
          toast.success('Thank you! Our team will contact you soon.');
        }
      } catch (userEmailErr) {
        logger.error('Error sending user confirmation email:', userEmailErr);
        toast.success('Thank you! Our team will contact you soon.');
      }
      
      // Reset form
      setContactFormData({
        fullName: '',
        email: '',
        mobileNumber: '',
        businessType: '',
        message: ''
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit. Please try again.');
    } finally {
      setIsSubmittingContact(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ultra-Premium Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Dynamic gradient mesh */}
        <div 
          className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-gradient-to-br from-primary/40 via-blue-500/30 to-purple-500/20 rounded-full blur-[120px] animate-pulse"
          style={{
            transform: `translate(${mousePosition.x * 0.03}px, ${mousePosition.y * 0.03}px)`,
            transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        />
        <div 
          className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-gradient-to-tr from-orange-500/30 via-pink-500/20 to-purple-500/20 rounded-full blur-[120px] animate-pulse"
          style={{
            animationDelay: '1.5s',
            transform: `translate(${mousePosition.x * -0.03}px, ${mousePosition.y * -0.03}px)`,
            transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        />
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[150px]"
          style={{
            background: `radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)`,
            transform: `translate(${mousePosition.x * 0.015}px, ${mousePosition.y * 0.015}px)`,
            transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        />
        
        {/* Animated grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
        
        {/* Premium floating particles */}
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-gradient-to-br from-primary/30 to-blue-400/20"
            style={{
              width: `${Math.random() * 4 + 2}px`,
              height: `${Math.random() * 4 + 2}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `premiumFloat ${4 + Math.random() * 6}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 3}s`,
              boxShadow: `0 0 ${Math.random() * 20 + 10}px rgba(59, 130, 246, 0.5)`
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes premiumFloat {
          0%, 100% { 
            transform: translateY(0px) translateX(0px) scale(1); 
            opacity: 0.3; 
          }
          33% { 
            transform: translateY(-30px) translateX(15px) scale(1.2); 
            opacity: 0.7; 
          }
          66% { 
            transform: translateY(-15px) translateX(-10px) scale(0.9); 
            opacity: 0.5; 
          }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .shimmer-effect {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
          background-size: 1000px 100%;
          animation: shimmer 3s infinite;
        }
        .glass-card {
          background: rgba(30, 41, 59, 0.4);
          backdrop-filter: blur(20px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }
        .premium-glow {
          position: relative;
        }
        .premium-glow::before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          padding: 2px;
          background: linear-gradient(45deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6);
          background-size: 200% 200%;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          animation: gradientShift 3s ease infinite;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .premium-glow:hover::before {
          opacity: 1;
        }
      `}</style>

      <div className="w-full max-w-6xl relative z-10 space-y-8">
        {/* Sign Up Notice Banner - Ultra-Premium */}
        {currentView === 'signup' && (
          <Card className="relative overflow-hidden border-2 border-orange-500/40 bg-gradient-to-br from-orange-950/95 via-orange-900/85 to-amber-950/95 backdrop-blur-2xl shadow-2xl premium-glow">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-orange-500/10 animate-pulse"></div>
            <div className="absolute inset-0 shimmer-effect opacity-30"></div>
            
            <CardContent className="p-8 md:p-10 relative z-10">
              <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8">
                <div className="flex items-start gap-5 flex-1">
                  <div className="relative">
                    <div className="absolute inset-0 bg-orange-500/60 rounded-full blur-2xl animate-pulse"></div>
                    <div className="relative bg-gradient-to-br from-orange-500 to-amber-600 rounded-full p-4 shadow-2xl">
                      <AlertCircle className="h-7 w-7 text-white drop-shadow-lg" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl md:text-3xl font-black text-white mb-3 drop-shadow-lg">
                      Sign Up Available Only on Mobile App
                    </h3>
                    <p className="text-base md:text-lg text-orange-100/90 leading-relaxed max-w-2xl">
                      To create an account and get started, please download our mobile app from the App Store or Google Play Store. The web application is for account management only.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto lg:flex-shrink-0">
                  <Button
                    asChild
                    className="relative overflow-hidden bg-white hover:bg-gray-50 text-gray-900 border-2 border-gray-200 hover:border-gray-300 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 font-bold h-14 px-8 group"
                  >
                    <a href="https://play.google.com/store" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
                      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" />
                      </svg>
                      <span className="font-bold">Google Play Store</span>
                      <ExternalLink className="w-5 h-5 opacity-70" />
                      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-200/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></span>
                    </a>
                  </Button>
                  <Button
                    asChild
                    className="relative overflow-hidden bg-white hover:bg-gray-50 text-gray-900 border-2 border-gray-200 hover:border-gray-300 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 font-bold h-14 px-8 group"
                  >
                    <a href="https://apps.apple.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
                      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.05,20.28C14.75,21.36 13.5,20.5 12,20.5C10.5,20.5 9.25,21.36 6.95,20.28C4.65,19.2 3.5,16.74 3.5,13.5C3.5,10.26 4.65,7.8 6.95,6.72C9.25,5.64 10.5,6.5 12,6.5C13.5,6.5 14.75,5.64 17.05,6.72C19.35,7.8 20.5,10.26 20.5,13.5C20.5,16.74 19.35,19.2 17.05,20.28M12,2C11.5,2 11,2.19 10.59,2.59C10.19,3 10,3.5 10,4C10,4.5 10.19,5 10.59,5.41C11,5.81 11.5,6 12,6C12.5,6 13,5.81 13.41,5.41C13.81,5 14,4.5 14,4C14,3.5 13.81,3 13.41,2.59C13,2.19 12.5,2 12,2Z" />
                      </svg>
                      <span className="font-bold">App Store</span>
                      <ExternalLink className="w-5 h-5 opacity-70" />
                      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-200/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></span>
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ultra-Premium Login View */}
        {currentView === 'login' && (
          <div className="w-full max-w-md mx-auto">
            <Card className="relative z-10 shadow-2xl border-2 border-primary/30 backdrop-blur-2xl bg-gradient-to-br from-slate-900/80 via-slate-800/70 to-slate-900/80 overflow-hidden group hover:border-primary/50 transition-all duration-500 premium-glow">
              <div className="absolute inset-0 shimmer-effect pointer-events-none opacity-20"></div>
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/30 via-primary/10 to-primary/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
              
              {/* Corner accents */}
              <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-br-full opacity-50"></div>
              <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-primary/20 to-transparent rounded-tl-full opacity-50"></div>
              
              <CardHeader className="text-center pb-10 pt-10 relative z-10">
                <div className="flex flex-col items-center gap-5 mb-8">
                  <div className="relative group/logo">
                    <div className="absolute -inset-3 bg-gradient-to-r from-primary via-blue-500 to-purple-500 rounded-2xl opacity-60 blur-2xl group-hover/logo:opacity-100 transition-opacity duration-500 animate-pulse"></div>
                    <div className="absolute inset-0 bg-primary/40 rounded-xl blur-lg"></div>
                    <div className="relative bg-gradient-to-br from-primary via-blue-500 to-purple-600 p-5 rounded-2xl shadow-2xl transform group-hover/logo:scale-110 group-hover/logo:rotate-3 transition-all duration-500">
                      <Warehouse className="h-12 w-12 text-white drop-shadow-2xl" />
                    </div>
                  </div>
                  <div className="text-center">
                    <CardTitle className="text-4xl font-black bg-gradient-to-r from-white via-primary to-blue-400 bg-clip-text text-transparent mb-3">
                      Inventory Migrator
                    </CardTitle>
                    <div className="flex items-center justify-center gap-2 mt-3">
                      <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                      <span className="text-sm font-bold text-primary/90">Smart Inventory Management</span>
                    </div>
                  </div>
                </div>
                
                <CardDescription className="text-lg font-semibold text-foreground/80">
                  Sign in to manage your account
                </CardDescription>
              </CardHeader>

              <CardContent className="relative z-10 pb-10">
                <form onSubmit={handleSignIn} className="space-y-6">
                  {/* Email field */}
                  <div className="space-y-3">
                    <Label htmlFor="signin-email" className="text-sm font-bold flex items-center gap-2 text-foreground/90">
                      <Mail className="h-4 w-4 text-primary" />
                      Email Address
                    </Label>
                    <div className="relative group">
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent rounded-lg opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300 z-10 pointer-events-none" />
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setError(null);
                        }}
                        className="pl-12 h-14 text-base bg-slate-800/50 border-white/10 focus:border-primary/50 focus:ring-2 focus:ring-primary/30 transition-all duration-300 rounded-lg relative z-10 backdrop-blur-sm"
                        required
                      />
                    </div>
                  </div>

                  {/* Password field */}
                  <div className="space-y-3">
                    <Label htmlFor="signin-password" className="text-sm font-bold flex items-center gap-2 text-foreground/90">
                      <Lock className="h-4 w-4 text-primary" />
                      Password
                    </Label>
                    <div className="relative group">
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent rounded-lg opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300 z-10 pointer-events-none" />
                      <Input
                        id="signin-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError(null);
                        }}
                        className="pl-12 pr-12 h-14 text-base bg-slate-800/50 border-white/10 focus:border-primary/50 focus:ring-2 focus:ring-primary/30 transition-all duration-300 rounded-lg relative z-10 backdrop-blur-sm"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-primary transition-all duration-300 hover:scale-110 p-1 rounded z-20"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Error alert */}
                  {error && (
                    <Alert variant="destructive" className="animate-in slide-in-from-top-2 duration-300 border-red-500/50 bg-red-500/10 backdrop-blur-sm">
                      <AlertDescription className="flex items-center gap-2 text-sm font-semibold">
                        <AlertCircle className="h-4 w-4" />
                        <span>{error}</span>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Submit button */}
                  <Button 
                    type="submit" 
                    className="w-full h-14 text-lg font-black bg-gradient-to-r from-primary via-blue-500 to-purple-600 hover:from-primary/90 hover:via-blue-600 hover:to-purple-700 shadow-2xl hover:shadow-primary/50 transition-all duration-500 transform hover:scale-[1.02] active:scale-[0.98] rounded-lg relative overflow-hidden group" 
                    disabled={isLoading}
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></span>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                        <span className="relative z-10">Signing in...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="mr-2 h-6 w-6 relative z-10" />
                        <span className="relative z-10">Sign In</span>
                        <ArrowRight className="ml-2 h-5 w-5 relative z-10 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Ultra-Premium Contact/Support View */}
        {currentView === 'support' && (
          <div className="w-full max-w-2xl mx-auto">
            <Card className="relative z-10 shadow-2xl border-2 border-primary/30 backdrop-blur-2xl bg-gradient-to-br from-slate-900/80 via-slate-800/70 to-slate-900/80 overflow-hidden group hover:border-primary/50 transition-all duration-500 premium-glow">
              <div className="absolute inset-0 shimmer-effect pointer-events-none opacity-20"></div>
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/30 via-primary/10 to-primary/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
              
              {/* Corner accents */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/20 to-transparent rounded-bl-full opacity-50"></div>
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-primary/20 to-transparent rounded-tr-full opacity-50"></div>
              
              <CardHeader className="text-center pb-10 pt-10 relative z-10">
                <div className="relative inline-block mb-6">
                  <div className="absolute -inset-3 bg-gradient-to-r from-primary via-blue-500 to-purple-500 rounded-full opacity-30 blur-2xl animate-pulse"></div>
                  <CardTitle className="text-4xl md:text-5xl font-black bg-gradient-to-r from-primary via-blue-400 to-purple-400 bg-clip-text text-transparent relative z-10 drop-shadow-lg">
                    Support & Account Deletion
                  </CardTitle>
                </div>
                <CardDescription className="text-lg font-semibold text-foreground/70 max-w-md mx-auto">
                  Contact our support team or request account deletion
                </CardDescription>
              </CardHeader>

              <CardContent className="relative z-10 pb-10">
                {/* Account Deletion Section - Prominently Featured */}
                <div className="mb-8 p-6 rounded-xl bg-gradient-to-br from-red-500/10 via-orange-500/10 to-red-500/10 border-2 border-red-500/30">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="bg-red-500/20 p-3 rounded-lg">
                      <Trash2 className="h-6 w-6 text-red-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        Request Account Deletion
                        <span className="text-xs bg-red-500/30 text-red-200 px-2 py-1 rounded">Required by Google Play</span>
                      </h3>
                      <p className="text-white/80 text-sm mb-4 leading-relaxed">
                        To request deletion of your account and all associated data, please follow these steps:
                      </p>
                      <ol className="list-decimal list-inside space-y-2 text-white/90 text-sm mb-4 ml-2">
                        <li>Send an email to <a href="mailto:retailmarketingpro1.0@gmail.com?subject=Account Deletion Request" className="text-primary hover:underline font-semibold">retailmarketingpro1.0@gmail.com</a> with subject "Account Deletion Request"</li>
                        <li>Include your registered email address and full name</li>
                        <li>Confirm that you want to permanently delete your account</li>
                        <li>Your request will be processed within 7-14 business days</li>
                      </ol>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                          asChild
                          variant="destructive"
                          className="flex-1"
                        >
                          <a href="mailto:retailmarketingpro1.0@gmail.com?subject=Account Deletion Request&body=Please delete my account and all associated data.%0D%0A%0D%0ARegistered Email:%0D%0AFull Name:%0D%0A%0D%0AI confirm that I want to permanently delete my account.">
                            <Mail className="h-4 w-4 mr-2" />
                            Send Deletion Request
                          </a>
                        </Button>
                        <Button
                          onClick={() => navigate('/account-deletion')}
                          variant="outline"
                          className="flex-1 border-primary/50 text-primary hover:bg-primary/10"
                        >
                          <Info className="h-4 w-4 mr-2" />
                          View Full Details
                        </Button>
                      </div>
                      <div className="mt-4 p-3 bg-slate-800/50 rounded-lg border border-white/10">
                        <p className="text-xs text-white/70 leading-relaxed">
                          <strong className="text-white">What will be deleted:</strong> User profile, company information, products, invoices, purchase orders, suppliers, customers, financial records, and all associated data. Deletion is permanent and cannot be undone.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-6 mb-6">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    General Support Contact Form
                  </h3>
                </div>

                <form onSubmit={handleContactSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Full Name */}
                    <div className="space-y-2">
                      <Label htmlFor="contact-name" className="text-sm font-bold flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        Full Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="contact-name"
                        type="text"
                        placeholder="Enter your full name"
                        value={contactFormData.fullName}
                        onChange={(e) => setContactFormData({ ...contactFormData, fullName: e.target.value })}
                        className="h-12 bg-slate-800/50 border-white/10 focus:border-primary/50 focus:ring-2 focus:ring-primary/30 backdrop-blur-sm"
                        required
                      />
                    </div>

                    {/* Email */}
                    <div className="space-y-2">
                      <Label htmlFor="contact-email" className="text-sm font-bold flex items-center gap-2">
                        <Mail className="h-4 w-4 text-primary" />
                        Email Address <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="contact-email"
                        type="email"
                        placeholder="your@email.com"
                        value={contactFormData.email}
                        onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                        className="h-12 bg-slate-800/50 border-white/10 focus:border-primary/50 focus:ring-2 focus:ring-primary/30 backdrop-blur-sm"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Mobile Number */}
                    <div className="space-y-2">
                      <Label htmlFor="contact-mobile" className="text-sm font-bold flex items-center gap-2">
                        <Phone className="h-4 w-4 text-primary" />
                        Mobile Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="contact-mobile"
                        type="tel"
                        placeholder="9876543210"
                        value={contactFormData.mobileNumber}
                        onChange={(e) => setContactFormData({ ...contactFormData, mobileNumber: e.target.value })}
                        className="h-12 bg-slate-800/50 border-white/10 focus:border-primary/50 focus:ring-2 focus:ring-primary/30 backdrop-blur-sm"
                        required
                      />
                    </div>

                    {/* Business Type */}
                    <div className="space-y-2">
                      <Label htmlFor="contact-business" className="text-sm font-bold flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        Business Type <span className="text-muted-foreground">(Optional)</span>
                      </Label>
                      <Input
                        id="contact-business"
                        type="text"
                        placeholder="e.g., Retail, Restaurant, Healthcare"
                        value={contactFormData.businessType}
                        onChange={(e) => setContactFormData({ ...contactFormData, businessType: e.target.value })}
                        className="h-12 bg-slate-800/50 border-white/10 focus:border-primary/50 focus:ring-2 focus:ring-primary/30 backdrop-blur-sm"
                      />
                    </div>
                  </div>

                  {/* Message */}
                  <div className="space-y-2">
                    <Label htmlFor="contact-message" className="text-sm font-bold flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      Message <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="contact-message"
                      placeholder="Tell us about your business and setup requirements..."
                      value={contactFormData.message}
                      onChange={(e) => setContactFormData({ ...contactFormData, message: e.target.value })}
                      className="min-h-[140px] bg-slate-800/50 border-white/10 focus:border-primary/50 focus:ring-2 focus:ring-primary/30 resize-y backdrop-blur-sm"
                      required
                    />
                  </div>

                  {/* Submit button */}
                  <Button 
                    type="submit" 
                    className="w-full h-14 text-lg font-black bg-gradient-to-r from-primary via-blue-500 to-purple-600 hover:from-primary/90 hover:via-blue-600 hover:to-purple-700 shadow-2xl hover:shadow-primary/50 transition-all duration-500 transform hover:scale-[1.02] active:scale-[0.98] rounded-lg relative overflow-hidden group" 
                    disabled={isSubmittingContact}
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></span>
                    {isSubmittingContact ? (
                      <>
                        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                        <span className="relative z-10">Sending Message...</span>
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-6 w-6 relative z-10" />
                        <span className="relative z-10">Send Message</span>
                        <ArrowRight className="ml-2 h-5 w-5 relative z-10 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </Button>

                  {/* Login link */}
                  <p className="text-center text-sm text-muted-foreground pt-2">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentView('login');
                        navigate('/auth?view=login');
                      }}
                      className="text-primary hover:text-primary/80 hover:underline font-bold transition-colors duration-200"
                    >
                      Login here
                    </button>
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Auth;
