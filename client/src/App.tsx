import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { CryptoProvider } from './context/CryptoContext.js';
import { SocketProvider } from './context/SocketContext.js';
import { ChatProvider } from './context/ChatContext.js';
import { SetupView } from './views/SetupView.js';
import { LoginView } from './views/LoginView.js';
import { PairingView } from './views/PairingView.js';
import { PendingApprovalView } from './views/PendingApprovalView.js';
import { ChatView } from './views/ChatView.js';
import { Shield, ShieldAlert, Server, RefreshCw } from 'lucide-react';
import { apiFetch, getApiBaseUrl, setCustomApiBaseUrl, clearCustomApiBaseUrl } from './utils/api.js';
import { Button } from './components/ui/Button.js';
import { Input } from './components/ui/Input.js';

const MainRouter: React.FC = () => {
  const { user, device, isLoading, logout } = useAuth();
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [customUrlInput, setCustomUrlInput] = useState(() => getApiBaseUrl());
  const [viewState, setViewState] = useState<'login' | 'pairing' | 'pending_approval'>('login');

  const checkSetupStatus = async () => {
    setIsCheckingSetup(true);
    setConnectionError(null);
    try {
      const res = await apiFetch('/api/setup/status');
      if (res.ok) {
        const data = await res.json();
        setIsInitialized(data.isInitialized);
        setConnectionError(null);
      } else {
        setConnectionError(`Server returned HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (err: any) {
      console.error('Failed to query setup status', err);
      setConnectionError(err.message || 'Unable to establish connection to backend server.');
    } finally {
      setIsCheckingSetup(false);
    }
  };

  useEffect(() => {
    // Check if pairing URL parameters exist
    const params = new URLSearchParams(window.location.search);
    if (params.get('secret') || params.get('code')) {
      setViewState('pairing');
    }

    checkSetupStatus();
  }, []);

  const handleSaveCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomApiBaseUrl(customUrlInput);
    checkSetupStatus();
  };

  const handleResetUrl = () => {
    clearCustomApiBaseUrl();
    setCustomUrlInput('');
    checkSetupStatus();
  };

  if (isCheckingSetup || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-teal-400 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/20 animate-pulse">
            <Shield size={24} className="text-slate-950" />
          </div>
          <p className="text-xs text-slate-400 font-medium">Securing PrivateChat session...</p>
        </div>
      </div>
    );
  }

  // Handle unavailable backend connection with clear user-facing error & config
  if (connectionError && !user) {
    const currentBase = getApiBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : 'Default origin');
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-slate-950 via-[#0A0F1D] to-slate-950 text-slate-100">
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-500/10 mb-3">
              <ShieldAlert size={28} />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Backend Unreachable</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Unable to communicate with the PrivateChat backend service.
            </p>
          </div>

          <div className="p-3.5 bg-rose-950/20 border border-rose-800/40 rounded-xl mb-4 text-xs text-rose-300">
            <span className="font-semibold block mb-0.5">Connection Error:</span>
            <span className="text-[11px] font-mono break-all">{connectionError}</span>
          </div>

          <form onSubmit={handleSaveCustomUrl} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 tracking-wide uppercase block mb-1.5 flex items-center gap-1.5">
                <Server size={13} className="text-cyan-400" />
                <span>Backend Server URL</span>
              </label>
              <Input
                placeholder="e.g. https://chat.myhome.net or https://192.168.1.100:3000"
                value={customUrlInput}
                onChange={(e) => setCustomUrlInput(e.target.value)}
                helperText={`Currently pointing to: ${currentBase}`}
              />
            </div>

            <div className="space-y-2 pt-1">
              <Button type="submit" variant="primary" className="w-full">
                <RefreshCw size={15} className="mr-2" />
                <span>Save URL & Retry Connection</span>
              </Button>
              {getApiBaseUrl() && (
                <Button type="button" variant="outline" onClick={handleResetUrl} className="w-full">
                  <span>Reset to Same-Origin Default</span>
                </Button>
              )}
            </div>
          </form>

          <p className="mt-5 text-[11px] text-slate-500 text-center leading-relaxed">
            If hosting on GitHub Pages, enter your public backend URL or tunnel. If running locally, ensure the Node.js backend server is running (<code className="text-slate-400">npm start</code>).
          </p>
        </div>
      </div>
    );
  }

  // 1. One-time server initialization screen
  if (isInitialized === false) {
    return <SetupView />;
  }

  // 2. Authenticated user view
  if (user) {
    if (device?.status === 'pending') {
      return <PendingApprovalView onBackToLogin={logout} />;
    }

    return (
      <SocketProvider>
        <ChatProvider>
          <ChatView />
        </ChatProvider>
      </SocketProvider>
    );
  }

  // 3. Unauthenticated views (Login, Pairing, or Pending Approval)
  if (viewState === 'pending_approval') {
    return <PendingApprovalView onBackToLogin={() => setViewState('login')} />;
  }

  if (viewState === 'pairing') {
    return (
      <PairingView
        onSwitchToLogin={() => setViewState('login')}
        onPendingApproval={() => setViewState('pending_approval')}
      />
    );
  }

  return <LoginView onSwitchToPairing={() => setViewState('pairing')} />;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <CryptoProvider>
        <MainRouter />
      </CryptoProvider>
    </AuthProvider>
  );
};
