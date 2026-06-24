import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  Warehouse,
  ArrowRight,
  CheckCircle,
  Star,
  Zap,
  Trash2,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { ContactSupportPanel } from '@/components/support/ContactSupportPanel';
import { buildSupportMailtoUrl, SUPPORT_EMAIL } from '@/lib/supportEmail';

const Auth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const isRecoveryModeRef = useRef(false);
  
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const navigate = useNavigate();
  
  // Get view from URL params
  const [currentView, setCurrentView] = useState<'login' | 'support' | 'signup' | 'reset-password'>('login');

  const isPasswordRecoveryUrl = () => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search);
    return hashParams.get('type') === 'recovery' || queryParams.get('type') === 'recovery';
  };
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view') as 'login' | 'support' | 'signup' | 'reset-password';

    if (isPasswordRecoveryUrl()) {
      isRecoveryModeRef.current = true;
      setIsRecoveryMode(true);
      setCurrentView('reset-password');
      return;
    }

    if (view && ['login', 'support', 'signup', 'reset-password'].includes(view)) {
      setCurrentView(view);
    } else {
      setCurrentView('login');
    }
  }, []);

  useEffect(() => {
    const enterRecoveryIfNeeded = () => {
      if (isPasswordRecoveryUrl()) {
        isRecoveryModeRef.current = true;
        setIsRecoveryMode(true);
        setCurrentView('reset-password');
        return true;
      }
      return false;
    };

    enterRecoveryIfNeeded();

    const checkUser = async () => {
      if (enterRecoveryIfNeeded()) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (session && !isRecoveryModeRef.current) {
        navigate('/dashboard');
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || isPasswordRecoveryUrl()) {
        isRecoveryModeRef.current = true;
        setIsRecoveryMode(true);
        setCurrentView('reset-password');
        return;
      }

      if (session && !isRecoveryModeRef.current) {
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

  const formatAuthError = (message: string) => {
    const lower = message.toLowerCase();
    if (lower.includes('rate limit') || lower.includes('email rate')) {
      return 'Too many emails sent. Wait 15–60 minutes and try again, or ask an admin to reset your password in Supabase (Authentication → Users).';
    }
    if (lower.includes('email not confirmed') || lower.includes('not confirmed')) {
      return 'Please confirm your email first. Check your inbox (and spam) for the verification link, then try signing in again.';
    }
    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
      return 'Invalid email or password. Use Forgot password below, or reset it in Supabase if you are the admin.';
    }
    return message;
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Enter your email above, then click Forgot password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/auth?view=reset-password`,
      });

      if (error) {
        setError(formatAuthError(error.message));
      } else {
        toast.success('Password reset link sent. Check your inbox and spam folder.');
        setError(
          `If an account exists for ${trimmedEmail}, we sent a password reset link. Open it and set a new password, then sign in here.`
        );
      }
    } catch {
      setError('Could not send reset email. Try again or contact support.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setError(formatAuthError(error.message));
        return;
      }

      toast.success('Password updated successfully! Please sign in.');
      await supabase.auth.signOut({ scope: 'local' });
      isRecoveryModeRef.current = false;
      setIsRecoveryMode(false);
      setNewPassword('');
      setConfirmPassword('');
      setPassword('');
      setCurrentView('login');
      window.history.replaceState({}, '', '/auth?view=login');
    } catch {
      setError('Could not update password. Request a new reset link and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(formatAuthError(error.message));
      } else {
        toast.success('Successfully signed in!');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth?view=login`,
          data: {
            full_name: email.split('@')[0],
          },
        },
      });

      if (error) {
        if (error.message.includes('already registered')) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (signInError) {
            setError(formatAuthError('Account already exists. Please check your password and sign in.'));
          }
          return;
        }
        setError(formatAuthError(error.message));
      } else if (data.session) {
        toast.success('Account created successfully!');
        navigate('/dashboard');
      } else if (data.user) {
        toast.success('Account created! Check your email to verify before signing in.');
        setCurrentView('login');
        setPassword('');
        setError(
          'We sent a verification link to your email. Open it, then sign in here. Check spam if you do not see it within a few minutes.'
        );
      }
    } catch (err) {
      setError('An unexpected error occurred during signup');
    } finally {
      setIsLoading(false);
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
        {/* Signup View */}
        {currentView === 'signup' && (
          <div className="w-full max-w-md mx-auto">
            <Card className="relative z-10 shadow-2xl border-2 border-primary/30 backdrop-blur-2xl bg-gradient-to-br from-slate-900/80 via-slate-800/70 to-slate-900/80 overflow-hidden group hover:border-primary/50 transition-all duration-500 premium-glow">
              <CardHeader className="text-center pb-10 pt-10 relative z-10">
                <CardTitle className="text-3xl font-black bg-gradient-to-r from-white via-primary to-blue-400 bg-clip-text text-transparent mb-3">
                  Create Account
                </CardTitle>
                <CardDescription className="text-lg font-semibold text-foreground/80">
                  Join our premium inventory system
                </CardDescription>
              </CardHeader>

              <CardContent className="relative z-10 pb-10">
                <form onSubmit={handleSignUp} className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-sm font-bold flex items-center gap-2">
                       <Mail className="h-4 w-4 text-primary" /> Email Address
                    </Label>
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-slate-800/50 border-white/10"
                      required
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="text-sm font-bold flex items-center gap-2">
                       <Lock className="h-4 w-4 text-primary" /> Password
                    </Label>
                    <Input
                      type="password"
                      placeholder="Create a password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-slate-800/50 border-white/10"
                      required
                    />
                  </div>
                  {error && <div className="text-red-500 text-sm">{error}</div>}
                  <Button type="submit" className="w-full h-14 font-black" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin" /> : "Sign Up & Pay"}
                  </Button>
                </form>
                <p className="text-center mt-6 text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <button onClick={() => setCurrentView('login')} className="text-primary font-bold">Login</button>
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Reset password (from email link) */}
        {currentView === 'reset-password' && (
          <div className="w-full max-w-md mx-auto">
            <Card className="relative z-10 shadow-2xl border-2 border-primary/30 backdrop-blur-2xl bg-gradient-to-br from-slate-900/80 via-slate-800/70 to-slate-900/80">
              <CardHeader className="text-center pb-6 pt-10">
                <CardTitle className="text-3xl font-black bg-gradient-to-r from-white via-primary to-blue-400 bg-clip-text text-transparent mb-3">
                  Set new password
                </CardTitle>
                <CardDescription className="text-base font-medium text-foreground/80">
                  Choose a new password for your account
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-10">
                <form onSubmit={handleUpdatePassword} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="bg-slate-800/50 border-white/10 h-12"
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm password</Label>
                    <Input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="bg-slate-800/50 border-white/10 h-12"
                      required
                      minLength={6}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-sm text-primary hover:underline"
                  >
                    {showPassword ? 'Hide passwords' : 'Show passwords'}
                  </button>
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription className="flex items-center gap-2 text-sm">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                      </AlertDescription>
                    </Alert>
                  )}
                  <Button type="submit" className="w-full h-12 text-lg font-bold" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update password'
                    )}
                  </Button>
                </form>
                <p className="text-center mt-6 text-sm text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRecoveryMode(false);
                      setCurrentView('login');
                      window.history.replaceState({}, '', '/auth?view=login');
                    }}
                    className="text-primary font-bold"
                  >
                    Back to sign in
                  </button>
                </p>
              </CardContent>
            </Card>
          </div>
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
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-sm text-primary hover:underline font-medium"
                        disabled={isLoading}
                      >
                        Forgot password?
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
                        <li>Send an email to{' '}
                          <a
                            href={buildSupportMailtoUrl('account_deletion')}
                            className="text-primary hover:underline font-semibold"
                          >
                            {SUPPORT_EMAIL}
                          </a>{' '}
                          with subject &quot;Account Deletion Request&quot;</li>
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
                          <a href={buildSupportMailtoUrl('account_deletion')}>
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

                <div className="border-t border-white/10 pt-6 mb-2">
                  <ContactSupportPanel
                    title="General support"
                    description="Billing, technical issues, or questions — opens your email app with app version and user ID pre-filled."
                    className="text-white [&_h3]:text-white [&_label]:text-white/90"
                  />
                </div>

                <p className="text-center text-sm text-muted-foreground pt-4">
                  Manage or cancel subscription?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard?tab=subscription')}
                    className="text-primary hover:text-primary/80 hover:underline font-bold transition-colors duration-200"
                  >
                    Open Subscription
                  </button>
                </p>

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
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Auth;
