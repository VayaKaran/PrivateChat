import React, { useState, useEffect } from 'react';
import { UserX, Shield, ShieldOff, CheckCircle } from 'lucide-react';
import { Badge } from '../ui/Badge.js';
import { useAuth } from '../../context/AuthContext.js';
import { User } from '@privatechat/shared';
import { apiFetch } from '../../utils/api.js';

export const MemberManager: React.FC = () => {
  const { csrfToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Failed to load members', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleUpdateStatus = async (userId: string, newStatus: 'active' | 'suspended' | 'revoked') => {
    if (!csrfToken) return;
    if (!confirm(`Are you sure you want to mark this member as ${newStatus}?`)) return;

    try {
      const res = await apiFetch(`/api/users/${userId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        await fetchUsers();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update user status');
      }
    } catch (err: any) {
      alert(err.message || 'Error updating status');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Authorized Members
        </h4>
        <button
          onClick={fetchUsers}
          className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-xs text-slate-500 py-4 text-center">Loading members...</p>
        ) : users.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No members found.</p>
        ) : (
          users.map((u) => {
            const isOwner = u.role === 'owner';
            return (
              <div
                key={u.id}
                className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-100">{u.displayName}</span>
                    <span className="text-slate-500">@{u.username}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 uppercase font-medium">
                      {u.role}
                    </span>
                    <Badge
                      variant={
                        u.status === 'active'
                          ? 'green'
                          : u.status === 'suspended'
                          ? 'amber'
                          : 'rose'
                      }
                      size="sm"
                    >
                      {u.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Joined: {new Date(u.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {!isOwner && (
                  <div className="flex items-center gap-1.5">
                    {u.status === 'active' ? (
                      <button
                        onClick={() => handleUpdateStatus(u.id, 'revoked')}
                        title="Revoke Member Access"
                        className="px-2.5 py-1 text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg transition-colors"
                      >
                        Revoke
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus(u.id, 'active')}
                        title="Restore Member Access"
                        className="px-2.5 py-1 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg transition-colors"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
