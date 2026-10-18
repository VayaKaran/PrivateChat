import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck, CheckCircle2, Copy, AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';
import { computeSafetyNumber, SafetyNumberDetails } from '../../crypto/safetyNumbers.js';
import { useCrypto } from '../../context/CryptoContext.js';
import { useChat } from '../../context/ChatContext.js';
import { useAuth } from '../../context/AuthContext.js';

interface SafetyNumberModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SafetyNumberModal: React.FC<SafetyNumberModalProps> = ({ isOpen, onClose }) => {
  const { deviceKeys } = useCrypto();
  const { activeRoom, recipientDevices } = useChat();
  const { user } = useAuth();

  const [details, setDetails] = useState<SafetyNumberDetails | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const isDirect = activeRoom?.type === 'direct';
  const otherMember = isDirect ? activeRoom?.members.find((m) => m.userId !== user?.id) : null;
  const otherDevice = recipientDevices.find((d) => d.userId === otherMember?.userId);

  useEffect(() => {
    if (!isOpen || !deviceKeys || !otherDevice) return;

    computeSafetyNumber(deviceKeys.identityPublicKey, otherDevice.identityPublicKey).then(
      async (res) => {
        setDetails(res);
        try {
          const url = await QRCode.toDataURL(res.qrData, {
            margin: 2,
            width: 220,
            color: {
              dark: '#0A0F1D',
              light: '#FFFFFF',
            },
          });
          setQrDataUrl(url);
        } catch (err) {
          console.error('Failed to generate safety QR code', err);
        }
      }
    );
  }, [isOpen, deviceKeys, otherDevice]);

  const handleCopy = () => {
    if (details) {
      navigator.clipboard.writeText(details.numericFormat);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Safety Number Verification" maxWidth="max-w-lg">
      <div className="space-y-5 text-center">
        <p className="text-xs text-slate-300">
          Verify end-to-end encryption with <strong className="text-cyan-400">{otherMember?.displayName}</strong>.
          Compare these 60 digits or scan the QR code in person to ensure no third party or server is intercepting communication.
        </p>

        {/* QR Code Container */}
        {qrDataUrl && (
          <div className="flex justify-center my-3">
            <div className="p-2.5 bg-white rounded-2xl shadow-xl inline-block">
              <img src={qrDataUrl} alt="Safety Number QR Code" className="w-48 h-48 rounded-lg" />
            </div>
          </div>
        )}

        {/* 60 Digits Display */}
        {details && (
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-center font-mono text-sm tracking-wider text-cyan-300 font-semibold select-all">
              {details.numericFormat.split(' ').map((chunk, i) => (
                <span key={i} className="p-1 bg-slate-900 rounded border border-slate-800/80">
                  {chunk}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-xs text-slate-400">
              <span className="font-mono text-[11px] truncate">HEX: {details.fingerprintHex}</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-medium"
              >
                {copied ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Verification Status Banner */}
        <div className="p-3 bg-cyan-950/30 border border-cyan-500/20 rounded-xl text-xs text-slate-300 text-left flex items-start gap-2.5">
          <ShieldCheck size={18} className="text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-slate-100">Cryptographic Identity Authentication</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              If the safety numbers match on both devices, your messages are guaranteed to be end-to-end encrypted with no public-key substitution.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant={isVerified ? 'primary' : 'outline'}
            onClick={() => {
              setIsVerified(!isVerified);
              onClose();
            }}
          >
            {isVerified ? 'Marked as Verified' : 'Mark as Verified'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
