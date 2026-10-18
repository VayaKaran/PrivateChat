import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, KeyRound, QrCode } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { useAuth } from '../context/AuthContext.js';
import { useCrypto } from '../context/CryptoContext.js';
import { apiFetch } from '../utils/api.js';

interface LoginViewProps {
  onSwitchToPairing: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSwitchToPairing }) => {
  const { setAuthSession } = useAuth();
  const { hasExistingKeys, unlockKeys } = useCrypto();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // 1. Try to unlock local device keys if present in this browser
      if (hasExistingKeys) {
        const unlocked = await unlockKeys(password);
        if (!unlocked) {
          setError('Invalid password. Unable to decrypt device key vault.');
          setIsLoading(false);
          return;
        }
      }

      // 2. Submit login request to server
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          password,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Login failed.');
      }

      const data = await res.json();
      setAuthSession(data.user, data.device, data.csrfToken, data.sessionToken);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-slate-950 via-[#0A0F1D] to-slate-950">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-sm bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl"
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-teal-400 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/20 mb-3">
            <Shield size={24} className="text-slate-950" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">Sign In</h2>
          <p className="text-xs text-slate-400 mt-1">
            Access your authorized PrivateChat account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Username"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 font-medium">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
            Sign In
          </Button>

          <div className="pt-4 border-t border-slate-800 text-center">
            <button
              type="button"
              onClick={onSwitchToPairing}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center justify-center gap-1.5 mx-auto"
            >
              <QrCode size={14} />
              <span>Have an invitation or pairing code?</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
