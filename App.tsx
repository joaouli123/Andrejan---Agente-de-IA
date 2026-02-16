import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import Hero from './components/Hero';
import Features from './components/Features';
import Pricing, { Plan, PLANS } from './components/Pricing';
import FAQ from './components/FAQ';
import Dashboard from './components/Dashboard';
import TargetAudience from './components/TargetAudience';
import Auth from './components/Auth';
import Register from './components/Register';
import Checkout from './components/Checkout';
import PaymentConfirmation from './components/PaymentConfirmation';
import * as Storage from './services/storage';
import { verifyMercadoPagoPayment } from './services/paymentApi';

type ViewState = 'landing' | 'login' | 'register' | 'app' | 'checkout' | 'confirmation';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('login');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [registrationData, setRegistrationData] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<'approved' | 'pending' | 'rejected'>('pending');
  const [paymentId, setPaymentId] = useState<string | undefined>(undefined);
  // paymentData is not really used except for confirmation, but we can keep it simple

  // Check if user is already logged in on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const statusParam = (params.get('payment_status') || params.get('status') || '').toLowerCase();
    const paymentIdParam = params.get('payment_id') || params.get('collection_id') || undefined;

    if (statusParam) {
      const normalizedStatus: 'approved' | 'pending' | 'rejected' =
        statusParam === 'approved' ? 'approved' : statusParam === 'pending' ? 'pending' : 'rejected';

      const processPaymentReturn = async () => {
        let finalStatus = normalizedStatus;
        if (paymentIdParam) {
          try {
            const verification = await verifyMercadoPagoPayment(paymentIdParam);
            finalStatus = verification.status;
          } catch {}
        }

        setPaymentStatus(finalStatus);
        setPaymentId(paymentIdParam);

        const user = Storage.getUserProfile();
        if (finalStatus === 'approved' && user) {
          Storage.applyPlanToCurrentUser(user.plan);
        }

        setView('confirmation');

        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, cleanUrl);
      };

      void processPaymentReturn();
      return;
    }

    const user = Storage.getUserProfile();
    if (user) {
      if (user.status === 'pending_payment') {
        // Recover plan if possible
        const plan = PLANS.find(p => p.name === user.plan);
        if (plan) {
          setSelectedPlan(plan);
          setRegistrationData({ name: user.name, email: user.email });
          setView('checkout');
        } else {
             // Fallback if plan not found, maybe show pricing or let them pick again
             // ideally redirect to pricing, logged in as pending.
             // For now, let's just show pricing or landing, but they are logged in.
             setView('login');
        }
      } else {
        setView('app');
      }
    }
  }, []);

  const navigateToLogin = () => {
    setView('login');
    window.scrollTo(0, 0);
  };

  const navigateToApp = () => {
    const user = Storage.getUserProfile();
    if (user && user.status === 'pending_payment') {
         const plan = PLANS.find(p => p.name === user.plan);
         if (plan) {
             setSelectedPlan(plan);
             setRegistrationData({ name: user.name, email: user.email });
             setView('checkout');
             window.scrollTo(0, 0);
             return;
         }
    }
    setView('app');
    window.scrollTo(0, 0);
  };

  const navigateToHome = () => {
    Storage.logout();
    setView('login');
    window.scrollTo(0, 0);
  };

  const handleSelectPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    // If already logged in: check status? Assumed 'landing' user is ignored here.
    // If user is logged in they usually see dashboard. If they go to pricing from landing (while logged out state?)
    // Assuming fresh flow:
    setView('register');
    window.scrollTo(0, 0);
  };

  const handleRegisterSuccess = (data: any) => {
    setRegistrationData(data);
    // Create account immediately
    if (selectedPlan) {
        const isFreePlan = selectedPlan.id === 'free' || selectedPlan.price === 0;
        Storage.signup({
            name: data.name,
            email: data.email,
            password: data.password,
            plan: selectedPlan.name,
            status: isFreePlan ? 'active' : 'pending_payment'
        });

        if (isFreePlan) {
          Storage.applyPlanToCurrentUser('Free');
          setView('app');
          window.scrollTo(0, 0);
          return;
        }
    }
    setView('checkout');
    window.scrollTo(0, 0);
  };

  return (
    <div className='min-h-screen bg-slate-50'>
      {/* Show header/footer only on landing/pricing/etc, not usually inside app?
          Original code hid them for app/checkout/confirmation? Let's check original...
          Original App render:
          {view === 'landing' && <Header ... />}
          {view === 'landing' && <Hero ... />}
      */}

      {view === 'landing' && (
        <>
          <Header 
            onLogin={navigateToLogin} 
            onNavigateApp={() => {
              const pricingSection = document.getElementById('pricing');
              if (pricingSection) {
                pricingSection.scrollIntoView({ behavior: 'smooth' });
              }
            }}
          />
          <Hero onStart={() => {
            const pricingSection = document.getElementById('pricing');
            if (pricingSection) {
              pricingSection.scrollIntoView({ behavior: 'smooth' });
            }
          }} />
          <Features />
          <TargetAudience />
          <Pricing onSelectPlan={handleSelectPlan} />
          <FAQ />
          <Footer />
        </>
      )}

      {view === 'login' && (
        <Auth onLoginSuccess={navigateToApp} onBack={() => setView('login')} />
      )}

      {view === 'register' && selectedPlan && (
        <Register 
            plan={selectedPlan} 
            onSuccess={handleRegisterSuccess} 
            onBack={() => setView('login')} 
        />
      )}

      {view === 'checkout' && selectedPlan && (
        <Checkout
          plan={selectedPlan}
          onBack={() => setView('login')}
          initialUserData={registrationData}
        />
      )}

      {view === 'confirmation' && (
        <PaymentConfirmation
          status={paymentStatus}
          transactionId={paymentId}
          email={registrationData?.email || Storage.getUserProfile()?.email}
          onDashboard={navigateToApp}
        />
      )}

      {view === 'app' && (
        <Dashboard onLogout={navigateToHome} />
      )}
    </div>
  );
};

export default App;
