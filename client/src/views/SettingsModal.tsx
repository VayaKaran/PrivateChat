import React, { useState, useEffect } from 'react';
import { Wifi, Database, Laptop, Shield, KeyRound, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { Modal } from '../components/ui/Modal.js';
import { Button } from '../components/ui/Button.js';
import { useAuth } from '../context/AuthContext.js';
import { useCrypto } from '../context/CryptoContext.js';
import { apiFetch } from '../utils/api.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NetworkInfo {
  localIp: string;
  port: number;
  interfaces: Array<{ name: string; address: string; family: string }>;
  protocol: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, device, csrfToken } = useAuth();
  const { deviceKeys, lockKeys, resetAllKeys } = useCrypto();

  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [isLoadingNet, setIsLoadingNet] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  const isOwnerOrAdmin = user && ['owner', 'admin'].includes(user.role);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoadingNet(true);
    apiFetch('/api/system/network')
      .then((res) => res.json())
      .then((data) => setNetworkInfo(data))
      .catch((err) => console.error('Failed to load network info', err))
      .finally(() => setIsLoadingNet(false));
  }, [isOpen]);

  const handleBackup = async () => {
    if (!csrfToken) return;
    setIsBackingUp(true);
    setBackupMsg(null);
    try {
      const res = await apiFetch('/api/system/backup', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setBackupMsg(`Backup snapshot created: ${data.backupFileName}`);
      } else {
        const err = await res.json();
        setBackupMsg(`Error: ${err.error || 'Backup failed'}`);
      }
    } catch (err: any) {
      setBackupMsg(`Error: ${err.message}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleClearKeys = async () => {
    if (confirm('Warning: Clearing local encryption keys will remove your private keys from this browser. You will need to unlock with your password or pair again. Continue?')) {
      await resetAllKeys();
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings & Network Configuration" maxWidth="max-w-xl">
      <div className="space-y-6">
        {/* Local Network Connectivity */}
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Wifi size={14} className="text-cyan-400" />
            <span>Private Network Connectivity</span>
          </h4>
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
            <p className="text-slate-300">
              Other devices on your local Wi-Fi or private network can connect to this server at:
            </p>
            {networkInfo ? (
              <div className="space-y-1">
                {networkInfo.interfaces.map((iface, i) => (
                  <div
                    key={i}
                    className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between font-mono text-cyan-300 text-xs select-all"
                  >
                    <span>
                      {networkInfo.protocol}://{iface.address}:{networkInfo.port}
                    </span>
                    <span className="text-[10px] text-slate-500 uppercase">{iface.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">Detecting network interfaces...</p>
            )}
            <p className="text-[11px] text-slate-500">
              Zero public internet exposure: PrivateChat operates strictly over local network addresses.
            </p>
          </div>
        </div>

        {/* Current Device & Cryptography */}
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Laptop size={14} className="text-cyan-400" />
            <span>Current Device & Cryptographic Keys</span>
          </h4>
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Device Name:</span>
              <span className="font-semibold text-slate-200">{device?.deviceName || 'This Browser'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Device ID:</span>
              <span className="font-mono text-slate-300 text-[11px] truncate max-w-[200px]">
                {device?.id || 'Unknown'}
              </span>
            </div>
            {deviceKeys && (
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-slate-400 text-[11px] block mb-1">Identity Public Key (Ed25519):</span>
                <span className="font-mono text-cyan-400 text-[10px] bg-slate-900 p-1.5 rounded block truncate select-all">
                  {deviceKeys.identityPublicKey}
                </span>
              </div>
            )}

            <div className="pt-2 flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={lockKeys}>
                <KeyRound size={13} className="mr-1.5" />
                <span>Lock Key Vault</span>
              </Button>
              <Button size="sm" variant="danger" onClick={handleClearKeys}>
                Clear Local Keys
              </Button>
            </div>
          </div>
        </div>

        {/* Database Snapshot & Disaster Recovery (Owner/Admin only) */}
        {isOwnerOrAdmin && (
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Database size={14} className="text-cyan-400" />
              <span>Database Snapshot & Backup</span>
            </h4>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-3 text-xs">
              <p className="text-slate-300">
                Trigger an atomic SQLite backup (`VACUUM INTO`) to the server&apos;s data folder. Ciphertext and authorization metadata are safely snapshotted without interrupting active sessions.
              </p>
              {backupMsg && (
                <div className="p-2.5 bg-cyan-950/40 border border-cyan-500/30 rounded-lg text-xs text-cyan-300 flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
                  <span>{backupMsg}</span>
                </div>
              )}
              <Button size="sm" onClick={handleBackup} isLoading={isBackingUp}>
                <Download size={14} className="mr-1.5" />
                <span>Create SQLite Backup</span>
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
