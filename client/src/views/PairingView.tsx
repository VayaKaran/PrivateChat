import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { QrCode, Key, ArrowRight, UserPlus, Smartphone } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { useAuth } from '../context/AuthContext.js';
import { useCrypto } from '../context/CryptoContext.js';
import { apiFetch } from '../utils/api.js';

interface PairingViewProps {
  onSwitchToLogin: () => void;
  onPendingApproval: (invitationId: string, deviceId: string) => void;
}

export const PairingView: React.FC<PairingViewProps> = ({
  onSwitchToLogin,
  onPendingApproval,
}) => {
  const { setAuthSession } = useAuth();
  const { createKeyBundle, storeAndUnlockKeys } = useCrypto();

  const [secretOrCode, setSecretOrCode] = useState('');
  const [isValidated, setIsValidated] = useState(false);
  const [validationInfo, setValidationInfo] = useState<{
    recipientLabel?: string;
    requiresApproval?: boolean;
  } | null>(null);

  const [isNewAccount, setIsNewAccount] = useState(true);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deviceName, setDeviceName] = useState(
    navigator.userAgent.includes('Mobile') ? 'Mobile Phone' : 'Personal Laptop'
  );

  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill from URL query string if opened via QR code link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const secret = params.get('secret');
    const code = params.get('code');
    if (secret) {
      setSecretOrCode(secret);
      handleValidateCode(secret);
    } else if (code) {
      setSecretOrCode(code);
    }
  }, []);

  const handleValidateCode = async (codeToTest?: string) => {
    const target = codeToTest || secretOrCode;
    if (!target.trim()) return;

    setIsValidating(true);
    setError(null);
    try {
      const res = await apiFetch('/api/invitations/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secretOrCode: target.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Invalid or expired invitation code.');
      }

      const data = await res.json();
      setValidationInfo(data);
      setIsValidated(true);
      if (data.recipientLabel) {
        setDisplayName(data.recipientLabel);
      }
    } catch (err: any) {
      setError(err.message || 'Invitation validation failed.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isNewAccount && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 10) {
      setError('Password must be at least 10 characters long.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Generate client-side device keys
      const keyBundle = await createKeyBundle();

      // 2. Submit redemption to server
      const res = await apiFetch('/api/invitations/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretOrCode: secretOrCode.trim(),
          username: username.trim().toLowerCase(),
          displayName: displayName.trim() || username.trim(),
          password,
          isNewAccount,
          deviceName: deviceName.trim(),
          identityPublicKey: keyBundle.identityPublicKey,
          exchangePublicKey: keyBundle.exchangePublicKey,
          keySignature: keyBundle.keySignature,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Invitation redemption failed.');
      }

      const data = await res.json();

      if (data.pendingApproval) {
        onPendingApproval(data.invitationId, data.deviceId);
        return;
      }

      // Store private keys encrypted with user's password in IndexedDB
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

      // Authenticate
      setAuthSession(data.user, data.device, data.csrfToken, data.sessionToken);
    } catch (err: any) {
      setError(err.message || 'Redemption failed.');
    } finally {
      setIsSubmitting(false);
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
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-teal-400 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/20 mb-3">
            <QrCode size={24} className="text-slate-950" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">Redeem Invitation</h2>
          <p className="text-xs text-slate-400 mt-1">
            PrivateChat is invitation-only. Enter your pairing code to link this device.
          </p>
        </div>

        {!isValidated ? (
          <div className="space-y-4">
            <Input
              label="Invitation Code or Secret"
              placeholder="e.g. PVT-ABCD-EFGH"
              value={secretOrCode}
              onChange={(e) => setSecretOrCode(e.target.value)}
              autoFocus
            />

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 font-medium">
                {error}
              </div>
            )}

            <Button
              onClick={() => handleValidateCode()}
              className="w-full"
              size="lg"
              isLoading={isValidating}
              disabled={!secretOrCode.trim()}
            >
              <span>Validate Code</span>
              <ArrowRight size={16} className="ml-2" />
            </Button>

            <div className="pt-3 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="text-xs text-slate-400 hover:text-white"
              >
                Already have an account? <span className="text-cyan-400 font-medium">Sign In</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRedeem} className="space-y-4">
            {validationInfo?.recipientLabel && (
              <div className="p-3 bg-cyan-950/40 border border-cyan-500/30 rounded-xl text-xs text-cyan-300">
                Invitation valid for: <strong className="text-white">{validationInfo.recipientLabel}</strong>
              </div>
            )}

            {/* Account Mode Selection */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setIsNewAccount(true)}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold ${
                  isNewAccount ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                New Account
              </button>
              <button
                type="button"
                onClick={() => setIsNewAccount(false)}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold ${
                  !isNewAccount ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                Existing User
              </button>
            </div>

            <Input
              label="Username"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />

            {isNewAccount && (
              <Input
                label="Display Name"
                placeholder="Your Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            )}

            <Input
              label="This Device Name"
              placeholder="e.g. My Phone"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              required
            />

            <Input
              label="Account Password"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helperText="Protects your local encryption keys"
              required
            />

            {isNewAccount && (
              <Input
                label="Confirm Password"
                type="password"
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            )}

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 font-medium">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
              Complete Pairing
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
};
