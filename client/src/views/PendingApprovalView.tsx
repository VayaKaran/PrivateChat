import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, ShieldCheck, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button.js';
import { useAuth } from '../context/AuthContext.js';

interface PendingApprovalViewProps {
  invitationId?: string;
  deviceId?: string;
  onBackToLogin: () => void;
}

export const PendingApprovalView: React.FC<PendingApprovalViewProps> = ({
  onBackToLogin,
}) => {
  const { checkAuth } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Poll every 5 seconds to check if owner approved the user/device
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await checkAuth();
      } catch {
        // continue polling
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [checkAuth]);

  const handleManualCheck = async () => {
    setIsChecking(true);
    setMessage(null);
    try {
      await checkAuth();
      setMessage('Checked status with server.');
    } catch {
      setMessage('Failed to reach server. Please check your network connection.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-slate-950 via-[#0A0F1D] to-slate-950">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl text-center"
      >
        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-5 shadow-lg shadow-amber-500/10">
          <Clock size={32} className="animate-pulse" />
        </div>

        <h2 className="text-xl font-bold text-slate-100">Awaiting Owner Approval</h2>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          Your device registration has been received and requires manual approval by the server owner before access is granted.
        </p>

        <div className="my-6 p-4 bg-slate-950 border border-slate-800 rounded-2xl text-left space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <ShieldCheck size={16} className="text-cyan-400" />
            <span>Cryptographic Keys Stored Locally</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-normal">
            Your private encryption keys were generated and protected on this device. Once approved by the owner, your pairwise session keys will be activated automatically.
          </p>
        </div>

        {message && (
          <p className="mb-4 text-xs text-amber-300 font-medium bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
            {message}
          </p>
        )}

        <div className="space-y-3">
          <Button
            onClick={handleManualCheck}
            variant="outline"
            className="w-full"
            isLoading={isChecking}
          >
            <RefreshCw size={15} className="mr-2" />
            <span>Check Approval Status</span>
          </Button>

          <button
            onClick={onBackToLogin}
            className="w-full py-2.5 text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Back to Sign In</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
