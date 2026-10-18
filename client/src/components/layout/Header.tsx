import React from 'react';
import { Shield, ShieldAlert, Key, Lock, Users, Settings, LogOut, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useCrypto } from '../../context/CryptoContext.js';
import { useSocket } from '../../context/SocketContext.js';
import { Badge } from '../ui/Badge.js';

interface HeaderProps {
  onOpenAdmin: () => void;
  onOpenSettings: () => void;
  onOpenThreatModel: () => void;
  onOpenKeyUnlock: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenAdmin,
  onOpenSettings,
  onOpenThreatModel,
  onOpenKeyUnlock,
}) => {
  const { user, logout } = useAuth();
  const { isKeysUnlocked, lockKeys } = useCrypto();
  const { connectionState } = useSocket();

  const isOwnerOrAdmin = user && ['owner', 'admin'].includes(user.role);

  return (
    <header className="h-16 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
      {/* Brand & Connection State */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-teal-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-cyan-500/20">
          <Shield size={20} className="text-slate-950" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-slate-100 text-sm sm:text-base tracking-tight">PrivateChat</h1>
            <Badge variant="cyan" size="sm">E2EE</Badge>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            {connectionState === 'connected' ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 font-medium">Online</span>
              </>
            ) : connectionState === 'reconnecting' ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span className="text-amber-400 font-medium">Reconnecting...</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span className="text-rose-400 font-medium">Disconnected</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Actions & User Profile */}
      <div className="flex items-center gap-2">
        {/* Key Vault Status Button */}
        {isKeysUnlocked ? (
          <button
            onClick={lockKeys}
            title="Keys Unlocked (Click to Lock Vault)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium transition-colors"
          >
            <Key size={14} />
            <span className="hidden sm:inline">Vault Unlocked</span>
          </button>
        ) : (
          <button
            onClick={onOpenKeyUnlock}
            title="Keys Locked (Click to Unlock with Passphrase)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-medium transition-colors"
          >
            <Lock size={14} />
            <span className="hidden sm:inline">Unlock Vault</span>
          </button>
        )}

        {/* Threat Model / Privacy Information */}
        <button
          onClick={onOpenThreatModel}
          title="Security & Threat Model"
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ShieldAlert size={18} />
        </button>

        {/* Administration (Owner / Admin) */}
        {isOwnerOrAdmin && (
          <button
            onClick={onOpenAdmin}
            title="Manage Invitations & Devices"
            className="p-2 rounded-lg text-cyan-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
          >
            <Users size={18} />
          </button>
        )}

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          title="Application Preferences"
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <Settings size={18} />
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          title="Logout"
          className="p-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-slate-800 transition-colors"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
};
