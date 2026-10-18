import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Plus, Copy, CheckCircle2, Trash2, Key, AlertCircle, Clock, ShieldAlert } from 'lucide-react';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';
import { Badge } from '../ui/Badge.js';
import { Modal } from '../ui/Modal.js';
import { useAuth } from '../../context/AuthContext.js';
import { Invitation } from '@privatechat/shared';
import { apiFetch } from '../../utils/api.js';

export const InvitationManager: React.FC = () => {
  const { csrfToken } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [recipientLabel, setRecipientLabel] = useState('');
  const [ttlHours, setTtlHours] = useState(24);
  const [maxUses, setMaxUses] = useState(1);
  const [requiresApproval, setRequiresApproval] = useState(false);

  // Modal to show generated secret once
  const [createdSecretInfo, setCreatedSecretInfo] = useState<{
    code: string;
    secret: string;
    pairingUrl: string;
    qrDataUrl?: string;
  } | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const fetchInvitations = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/invitations');
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations || []);
      }
    } catch (err) {
      console.error('Failed to load invitations', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csrfToken) return;

    setIsGenerating(true);
    try {
      const res = await apiFetch('/api/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          recipientLabel: recipientLabel.trim() || undefined,
          ttlHours: Number(ttlHours),
          maxUses: Number(maxUses),
          requiresApproval,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate invitation');
      }

      const data = await res.json();
      const qrUrl = await QRCode.toDataURL(data.pairingUrl, {
        margin: 2,
        width: 200,
        color: { dark: '#0A0F1D', light: '#FFFFFF' },
      });

      setCreatedSecretInfo({
        code: data.invitation.code,
        secret: data.secret,
        pairingUrl: data.pairingUrl,
        qrDataUrl: qrUrl,
      });

      setRecipientLabel('');
      await fetchInvitations();
    } catch (err: any) {
      alert(err.message || 'Error creating invitation');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!csrfToken || !confirm('Are you sure you want to revoke this invitation immediately?')) return;
    try {
      const res = await apiFetch(`/api/invitations/${id}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
      });
      if (res.ok) {
        await fetchInvitations();
      }
    } catch (err) {
      console.error('Failed to revoke invitation', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Creation Card */}
      <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl">
        <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2 mb-3">
          <Plus size={16} className="text-cyan-400" />
          <span>Generate Secure Invitation</span>
        </h4>
        <form onSubmit={handleGenerate} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Recipient Label (Optional)"
              placeholder="e.g. Alice"
              value={recipientLabel}
              onChange={(e) => setRecipientLabel(e.target.value)}
            />
            <div>
              <label className="text-xs font-semibold text-slate-300 tracking-wide uppercase block mb-1.5">
                Expires In
              </label>
              <select
                value={ttlHours}
                onChange={(e) => setTtlHours(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-cyan-500"
              >
                <option value={1}>1 hour</option>
                <option value={6}>6 hours</option>
                <option value={24}>24 hours</option>
                <option value={72}>3 days</option>
                <option value={168}>7 days</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 tracking-wide uppercase block mb-1.5">
                Max Permitted Uses
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={maxUses}
                onChange={(e) => setMaxUses(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="reqApproval"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-500"
            />
            <label htmlFor="reqApproval" className="text-xs text-slate-300 select-none cursor-pointer">
              Require manual administrator approval before pairing device
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" isLoading={isGenerating}>
              Create Invitation
            </Button>
          </div>
        </form>
      </div>

      {/* Invitations List */}
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
          Active & Past Invitations
        </h4>
        <div className="space-y-2">
          {isLoading ? (
            <p className="text-xs text-slate-500 py-3 text-center">Loading invitations...</p>
          ) : invitations.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No invitations have been generated yet.</p>
          ) : (
            invitations.map((inv) => (
              <div
                key={inv.id}
                className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-cyan-300 tracking-wider">{inv.code}</span>
                    <Badge
                      variant={
                        inv.status === 'active'
                          ? 'green'
                          : inv.status === 'consumed'
                          ? 'slate'
                          : inv.status === 'revoked'
                          ? 'rose'
                          : 'amber'
                      }
                      size="sm"
                    >
                      {inv.status}
                    </Badge>
                    {inv.recipientLabel && (
                      <span className="text-slate-300 font-medium">({inv.recipientLabel})</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                    <span>
                      Uses: {inv.usedCount}/{inv.maxUses}
                    </span>
                    <span>•</span>
                    <span>Expires: {new Date(inv.expiresAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {inv.status === 'active' && (
                  <button
                    onClick={() => handleRevoke(inv.id)}
                    title="Revoke Invitation"
                    className="p-2 text-rose-400 hover:text-rose-300 hover:bg-slate-900 rounded-lg transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Secret One-Time Display Modal */}
      {createdSecretInfo && (
        <Modal
          isOpen={true}
          onClose={() => setCreatedSecretInfo(null)}
          title="Invitation Generated"
          maxWidth="max-w-md"
        >
          <div className="space-y-4 text-center">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 text-left flex items-start gap-2">
              <ShieldAlert size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Copy this credential now.</p>
                <p className="text-[11px] text-amber-300/80 mt-0.5">
                  The raw invitation secret is never stored on the server and cannot be viewed again.
                </p>
              </div>
            </div>

            {createdSecretInfo.qrDataUrl && (
              <div className="flex justify-center">
                <div className="p-2 bg-white rounded-xl inline-block shadow-md">
                  <img src={createdSecretInfo.qrDataUrl} alt="Pairing QR" className="w-44 h-44 rounded-lg" />
                </div>
              </div>
            )}

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-left space-y-2 text-xs">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Pairing Code</span>
                <div className="flex items-center justify-between font-mono text-cyan-300 font-bold text-sm mt-0.5">
                  <span>{createdSecretInfo.code}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdSecretInfo.code);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    {copiedCode ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Pairing URL</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-mono text-[11px] text-slate-300 truncate max-w-[280px]">
                    {createdSecretInfo.pairingUrl}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdSecretInfo.pairingUrl);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
                  >
                    {copiedLink ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            <Button onClick={() => setCreatedSecretInfo(null)} className="w-full">
              Done
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};
