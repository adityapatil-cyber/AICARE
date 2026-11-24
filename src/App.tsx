import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import type { Business } from './types/aicare';
import { auth } from './lib/firebase';
import { subscribeOwnerBusinesses } from './lib/firestoreService';
import { AuthModal } from './components/AuthModal';
import { Dashboard } from './components/Dashboard';
import { DemoPage } from './components/DemoPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './components/LandingPage';
import { OnboardingWizard } from './components/OnboardingWizard';
import { PublicBotPage } from './components/PublicBotPage';

type RouteState =
  | { kind: 'landing' }
  | { kind: 'demo' }
  | { kind: 'onboarding' }
  | { kind: 'dashboard' }
  | { kind: 'public_chat'; businessId: string }
  | { kind: 'public_widget'; businessId: string };

function parseLocationRoute(): RouteState {
  const path = window.location.pathname;
  if (path.startsWith('/widget/')) {
    const businessId = decodeURIComponent(path.slice('/widget/'.length).split('/')[0] || '');
    return { kind: 'public_widget', businessId };
  }
  if (path.startsWith('/chat/')) {
    const businessId = decodeURIComponent(path.slice('/chat/'.length).split('/')[0] || '');
    return { kind: 'public_chat', businessId };
  }
  if (path === '/demo') return { kind: 'demo' };
  if (path === '/onboarding') return { kind: 'onboarding' };
  if (path === '/dashboard') return { kind: 'dashboard' };
  return { kind: 'landing' };
}

function AppContent() {
  const [route, setRoute] = useState<RouteState>(() => parseLocationRoute());
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessesLoaded, setBusinessesLoaded] = useState(false);
  const [activeBusinessId, setActiveBusinessId] = useState<string>('');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const [creatingNewBiz, setCreatingNewBiz] = useState(false);

  const navigate = (nextPath: string) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setRoute(parseLocationRoute());
  };

  useEffect(() => {
    const onPop = () => setRoute(parseLocationRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (!firebaseUser) {
        setBusinesses([]);
        setBusinessesLoaded(false);
        setActiveBusinessId('');
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      setBusinesses([]);
      setBusinessesLoaded(true);
      return;
    }
    setBusinessesLoaded(false);
    const unsub = subscribeOwnerBusinesses(user.uid, (list) => {
      setBusinesses(list);
      setBusinessesLoaded(true);
      if (list.length > 0 && (!activeBusinessId || !list.some((b) => b.id === activeBusinessId))) {
        setActiveBusinessId(list[0].id);
      }
    });
    return unsub;
  }, [authReady, user?.uid, user?.emailVerified]);

  // Public Chatbot & Widget routes work independently of owner authentication
  if (route.kind === 'public_widget') {
    return <PublicBotPage businessId={route.businessId} isWidget />;
  }
  if (route.kind === 'public_chat') {
    return <PublicBotPage businessId={route.businessId} isWidget={false} />;
  }

  // Demo route
  if (route.kind === 'demo') {
    return (
      <>
        <DemoPage
          onBack={() => navigate('/')}
          onStartFree={() => {
            if (user && user.emailVerified) {
              navigate('/onboarding');
            } else {
              setAuthModalMode('signup');
              setAuthModalOpen(true);
            }
          }}
        />
        <AuthModal
          isOpen={authModalOpen}
          initialMode={authModalMode}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={() => {
            setAuthModalOpen(false);
            navigate('/dashboard');
          }}
        />
      </>
    );
  }

  const isVerifiedOwner = Boolean(user && user.emailVerified);

  // Authenticated Dashboard / Onboarding views
  if ((route.kind === 'dashboard' || route.kind === 'onboarding') && authReady) {
    if (!isVerifiedOwner || !user) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-4">
            <h1 className="text-xl font-bold text-slate-900">Sign in to your AICare workspace</h1>
            <p className="text-sm text-slate-600">
              Please sign in with a verified account to manage your business assistant and knowledge base.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('signin');
                  setAuthModalOpen(true);
                }}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl"
              >
                Sign In / Create Account
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-full py-2 px-4 text-sm text-slate-600 hover:text-slate-900"
              >
                Return to Landing Page
              </button>
            </div>
          </div>
          <AuthModal
            isOpen={authModalOpen}
            initialMode={authModalMode}
            onClose={() => setAuthModalOpen(false)}
            onSuccess={() => setAuthModalOpen(false)}
          />
        </div>
      );
    }

    if (!businessesLoaded) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-sm text-slate-500">Loading your workspace...</div>
        </div>
      );
    }

    if (route.kind === 'onboarding' || creatingNewBiz || businesses.length === 0) {
      return (
        <OnboardingWizard
          userId={user.uid}
          userEmail={user.email || ''}
          existingBusiness={
            creatingNewBiz ? null : businesses.length === 1 && !businesses[0].isPublished ? businesses[0] : null
          }
          onComplete={(bizId) => {
            setCreatingNewBiz(false);
            setActiveBusinessId(bizId);
            navigate('/dashboard');
          }}
          onCancel={
            businesses.length > 0
              ? () => {
                  setCreatingNewBiz(false);
                  navigate('/dashboard');
                }
              : undefined
          }
        />
      );
    }

    return (
      <Dashboard
        user={user}
        businesses={businesses}
        activeBusinessId={activeBusinessId || businesses[0].id}
        onSelectBusiness={setActiveBusinessId}
        onCreateNewBusiness={() => {
          setCreatingNewBiz(true);
          navigate('/onboarding');
        }}
        onBackHome={() => navigate('/')}
      />
    );
  }

  return (
    <>
      <LandingPage
        isAuthenticated={isVerifiedOwner}
        onStartFree={() => {
          if (isVerifiedOwner) {
            navigate('/dashboard');
          } else {
            setAuthModalMode('signup');
            setAuthModalOpen(true);
          }
        }}
        onSignIn={() => {
          setAuthModalMode('signin');
          setAuthModalOpen(true);
        }}
        onExploreDemo={() => navigate('/demo')}
        onOpenDashboard={() => navigate('/dashboard')}
      />
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => {
          setAuthModalOpen(false);
          navigate('/dashboard');
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
