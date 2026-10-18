import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Key, Eye, EyeOff } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { useAuth } from '../context/AuthContext.js';
import { useCrypto } from '../context/CryptoContext.js';
import { apiFetch } from '../utils/api.js';

export const SetupView: React.FC = () => {
  const { setAuthSession } = useAuth();
  const { createKeyBundle, storeAndUnlockKeys } = useCrypto();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showMasterPassword, setShowMasterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [deviceName, setDeviceName] = useState(
    navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Primary Workstation'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 10) {
      setError('Password must be at least 10 characters long.');
      return;
    }

    setIsLoading(true);
    try {
      // 1. Generate client-side cryptographic keypairs (Ed25519 + X25519)
      const keyBundle = await createKeyBundle();

      // 2. Submit initialization request to server
      const res = await apiFetch('/api/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          displayName: displayName.trim() || username.trim(),
          password,
          deviceName: deviceName.trim(),
          identityPublicKey: keyBundle.identityPublicKey,
          exchangePublicKey: keyBundle.exchangePublicKey,
          keySignature: keyBundle.keySignature,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Server initialization failed.');
      }

      const data = await res.json();

      // 3. Store private keys in browser IndexedDB encrypted with user password
      await storeAndUnlockKeys(
        {
          deviceId: data.device.id,
          userId: data.user.id,
          identityPublicKey: keyBundle.identityPublicKey,
          identityPrivateKey: keyBundle.identityPrivateKey,
          exchangePublicKey: keyBundle.exchangePublicKey,
          exchangePrivateKey: keyBundle.exchangePrivateKey,
          keySignature: keyBundle.keySignature,
          createdAt: Date.now(),
        },
        password
      );

      // 4. Update auth state
      setAuthSession(data.user, data.device, data.csrfToken, data.sessionToken);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during setup.');
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
        className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl"
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-teal-400 flex items-center justify-center text-slate-950 shadow-xl shadow-cyan-500/20 mb-3">
            <Shield size={28} className="text-slate-950" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">Initialize PrivateChat</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            This server is currently uninitialized. Create the master Owner account to establish identity keys and begin.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Owner Username"
            placeholder="e.g. admin or alice"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Display Name"
            placeholder="e.g. Alice Administrator"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />

          <Input
            label="This Device Name"
            placeholder="e.g. Macbook Pro or Home Desktop"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Master Password"
              type={showMasterPassword ? 'text' : 'password'}
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helperText="Min. 10 chars"
              required
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowMasterPassword((prev) => !prev)}
                  aria-label={showMasterPassword ? 'Hide master password' : 'Show master password'}
                  title={showMasterPassword ? 'Hide master password' : 'Show master password'}
                  aria-pressed={showMasterPassword}
                  className="p-1 rounded-md text-slate-400 hover:text-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:text-cyan-400 transition-colors"
                >
                  {showMasterPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
            <Input
              label="Confirm Password"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="••••••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                  title={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                  aria-pressed={showConfirmPassword}
                  className="p-1 rounded-md text-slate-400 hover:text-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:text-cyan-400 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
          </div>

          <div className="p-3 bg-cyan-950/30 border border-cyan-500/20 rounded-xl text-xs text-slate-300 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
              <Key size={14} />
              <span>Cryptographic Keys Generated On This Device</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Your password encrypts your private keys in this browser’s IndexedDB vault. The server never receives your plaintext private keys or password.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 font-medium">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
            Initialize Application
          </Button>
        </form>
      </motion.div>
    </div>
  );
};
