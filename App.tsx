
import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import Hero from './components/Hero';
import Features from './components/Features';
import Pricing from './components/Pricing';
import FAQ from './components/FAQ';
import Dashboard from './components/Dashboard';
import TargetAudience from './components/TargetAudience';
import Auth from './components/Auth';
import * as Storage from './services/storage';

type ViewState = 'landing' | 'login' | 'app';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('landing');

  // Check if user is already logged in on mount
  useEffect(() => {
    const user = Storage.getUserProfile();
    if (user) {
        setView('app');
    }
  }, []);

  const navigateToLogin = () => {
    setView('login');
    window.scrollTo(0, 0);
  };

  const navigateToApp = () => {
    setView('app');
    window.scrollTo(0, 0);
  };

  const navigateToHome = () => {
    Storage.logout();
    setView('landing');
    window.scrollTo(0, 0);
  };

  // Login View
  if (view === 'login') {
    return <Auth onLoginSuccess={navigateToApp} onBack={() => setView('landing')} />;
  }

  // Dashboard View
  if (view === 'app') {
    return <Dashboard onLogout={navigateToHome} />;
  }

  // Landing Page Mode
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header 
        currentView={view} 
        onNavigateHome={() => setView('landing')} 
        onNavigateApp={navigateToLogin} // Changed to Login
      />
      
      <main className="flex-grow">
        <Hero onCtaClick={navigateToLogin} />
        <Features />
        <TargetAudience />
        <Pricing onSelectPlan={navigateToLogin} />
        <FAQ />
      </main>

      <Footer onNavigateHome={() => setView('landing')} />
    </div>
  );
};

export default App;
