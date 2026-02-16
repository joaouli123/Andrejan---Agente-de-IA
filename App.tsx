import React, { useState, useEffect, useCallback } from 'react';
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

/* ── Lightweight slug router ─────────────────────────────────────── */
const SLUG_MAP: Record<string, ViewState> = {
  '/': 'landing',
  '/entrar': 'login',
  '/cadastro': 'register',
  '/checkout': 'checkout',
  '/dashboard': 'app',
  '/confirmacao': 'confirmation',
};

const VIEW_TO_SLUG: Record<ViewState, string> = {
  landing: '/',
  login: '/entrar',
  register: '/cadastro',
  checkout: '/checkout',
  app: '/dashboard',
  confirmation: '/confirmacao',
};

function viewFromPath(pathname: string): ViewState | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return SLUG_MAP[clean] ?? null;
}

const App: React.FC = () => {
  const [view, setViewRaw] = useState<ViewState>('landing');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [registrationData, setRegistrationData] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<'approved' | 'pending' | 'rejected'>('pending');
  const [paymentId, setPaymentId] = useState<string | undefined>(undefined);

  /** Navigate to a view and update the browser URL */
  const navigateTo = useCallback((v: ViewState, replace = false) => {
    const slug = VIEW_TO_SLUG[v];
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({ view: v }, '', slug);
    setViewRaw(v);
    window.scrollTo(0, 0);
  }, []);

  /* ── Bootstrap: resolve initial URL, payment return, logged-in state ── */
  useEffect(() => {
    /* 1) payment return? */
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
        navigateTo('confirmation', true);
      };

      void processPaymentReturn();
      return;
    }

    /* 2) URL-based view */
    const urlView = viewFromPath(window.location.pathname);

    /* 3) logged-in user */
    const user = Storage.getUserProfile();
    if (user) {
      if (user.status === 'pending_payment') {
        const plan = PLANS.find(p => p.name === user.plan);
        if (plan) {
          setSelectedPlan(plan);
          setRegistrationData({ name: user.name, email: user.email });
          navigateTo('checkout', true);
        } else {
          navigateTo('landing', true);
        }
      } else if (urlView && urlView !== 'landing' && urlView !== 'login' && urlView !== 'register' && urlView !== 'confirmation') {
        navigateTo(urlView, true);
      } else {
        navigateTo('app', true);
      }
      return;
    }

    /* 4) not logged in: respect URL or fallback to landing */
    const allowedLoggedOut: ViewState[] = ['landing', 'login', 'register'];
    if (urlView && allowedLoggedOut.includes(urlView)) {
      navigateTo(urlView, true);
    } else {
      navigateTo('landing', true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Handle browser back/forward ── */
  useEffect(() => {
    const handlePop = () => {
      const v = viewFromPath(window.location.pathname);
      if (v) setViewRaw(v);
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  /* ── Navigation helpers ── */
  const navigateToLogin = () => navigateTo('login');

  const navigateToApp = () => {
    const user = Storage.getUserProfile();
    if (user && user.status === 'pending_payment') {
      const plan = PLANS.find(p => p.name === user.plan);
      if (plan) {
        setSelectedPlan(plan);
        setRegistrationData({ name: user.name, email: user.email });
        navigateTo('checkout');
        return;
      }
    }
    navigateTo('app');
  };

  const navigateToHome = () => {
    Storage.logout();
    navigateTo('landing');
  };

  const handleSelectPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    navigateTo('register');
  };

  const handleRegisterSuccess = (data: any) => {
    setRegistrationData(data);
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
        navigateTo('app');
        return;
      }
    }
    navigateTo('checkout');
  };

  return (
    <div className='min-h-screen bg-slate-50'>
      {view === 'landing' && (
        <>
          <Header 
            onNavigateHome={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            onLogin={navigateToLogin} 
            onNavigateApp={() => {
              const pricingSection = document.getElementById('pricing');
              if (pricingSection) {
                pricingSection.scrollIntoView({ behavior: 'smooth' });
              }
            }}
          />
          <Hero 
            onCtaClick={() => {
              const pricingSection = document.getElementById('pricing');
              if (pricingSection) {
                pricingSection.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            onViewPlans={() => {
              const pricingSection = document.getElementById('pricing');
              if (pricingSection) {
                pricingSection.scrollIntoView({ behavior: 'smooth' });
              }
            }}
          />
          <Features />
          <TargetAudience />
          <Pricing onSelectPlan={handleSelectPlan} />
          <FAQ />
          <Footer onNavigateHome={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
        </>
      )}

      {view === 'login' && (
        <Auth onLoginSuccess={navigateToApp} onBack={() => navigateTo('landing')} />
      )}

      {view === 'register' && selectedPlan && (
        <Register 
            plan={selectedPlan} 
            onSuccess={handleRegisterSuccess} 
            onBack={() => navigateTo('landing')} 
        />
      )}

      {view === 'checkout' && selectedPlan && (
        <Checkout
          plan={selectedPlan}
          onBack={() => navigateTo('landing')}
          onPaymentComplete={(status, paymentId) => {
            setPaymentStatus(status);
            setPaymentId(paymentId);
            if (status === 'approved') {
              const user = Storage.getUserProfile();
              if (user) Storage.applyPlanToCurrentUser(user.plan);
            }
            navigateTo('confirmation');
          }}
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
