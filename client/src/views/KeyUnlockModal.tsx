import React, { useState } from 'react';
import { KeyRound, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Modal } from '../components/ui/Modal.js';
import { Input } from '../components/ui/Input.js';
import { Button } from '../components/ui/Button.js';
import { useCrypto } from '../context/CryptoContext.js';

interface KeyUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyUnlockModal: React.FC<KeyUnlockModalProps> = ({ isOpen, onClose }) => {
  const { unlockKeys } = useCrypto();
  const [passphrase, setPassphrase] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim()) return;

    setIsUnlocking(true);
    setError(null);
    try {
      const success = await unlockKeys(passphrase);
      if (success) {
        setPassphrase('');
        onClose();
      } else {
        setError('Incorrect passphrase. Could not decrypt local key vault.');
      }
    } catch (err: any) {
      setError(err.message || 'Decryption error.');
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Unlock Encryption Key Vault" maxWidth="max-w-md">
      <form onSubmit={handleUnlock} className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
          <Lock size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p>
            Your private cryptographic keys are stored in encrypted form in your browser&apos;s IndexedDB. Enter your account password to decrypt them into memory.
          </p>
        </div>

        <Input
          label="Account Password / Passphrase"
          type="password"
          placeholder="••••••••••••"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          autoFocus
          required
        />

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 font-medium flex items-center gap-2">
            <AlertCircle size={15} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isUnlocking} disabled={!passphrase.trim()}>
            <KeyRound size={15} className="mr-2" />
            <span>Unlock Vault</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
};
