import React, { useState, useEffect } from 'react';
import { Smartphone, Laptop, Trash2, ShieldCheck, Key } from 'lucide-react';
import { Badge } from '../ui/Badge.js';
import { useAuth } from '../../context/AuthContext.js';
import { DevicePublicKeys } from '@privatechat/shared';
import { apiFetch } from '../../utils/api.js';

export const DeviceManager: React.FC = () => {
  const { user, device: currentDevice, csrfToken } = useAuth();
  const [devices, setDevices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isOwnerOrAdmin = user && ['owner', 'admin'].includes(user.role);

  const fetchDevices = async () => {
    setIsLoading(true);
    try {
      const url = isOwnerOrAdmin ? '/api/devices?all=true' : '/api/devices';
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
      }
    } catch (err) {
      console.error('Failed to load devices', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleRevokeDevice = async (deviceId: string) => {
    if (!csrfToken || !confirm('Are you sure you want to revoke this device? It will be immediately logged out and prevented from decrypting future messages.')) return;

    try {
      const res = await apiFetch(`/api/devices/${deviceId}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
      });

      if (res.ok) {
        await fetchDevices();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to revoke device');
      }
    } catch (err: any) {
      alert(err.message || 'Error revoking device');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          {isOwnerOrAdmin ? 'All Registered Devices' : 'My Registered Devices'}
        </h4>
        <button
          onClick={fetchDevices}
          className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-xs text-slate-500 py-4 text-center">Loading devices...</p>
        ) : devices.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No devices registered.</p>
        ) : (
          devices.map((d) => {
            const isThisDevice = currentDevice && d.id === currentDevice.id;
            return (
              <div
                key={d.id}
                className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                  isThisDevice
                    ? 'bg-cyan-950/30 border-cyan-500/40'
                    : 'bg-slate-950 border-slate-800'
                }`}
              >
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <Laptop size={15} className="text-cyan-400 flex-shrink-0" />
                    <span className="font-semibold text-slate-100 truncate">{d.deviceName}</span>
                    {isThisDevice && (
                      <span className="px-1.5 py-0.2 text-[10px] bg-cyan-500/20 text-cyan-300 rounded font-medium">
                        Current
                      </span>
                    )}
                    <Badge
                      variant={
                        d.status === 'active'
                          ? 'green'
                          : d.status === 'pending'
                          ? 'amber'
                          : 'rose'
                      }
                      size="sm"
                    >
                      {d.status}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                    {d.displayName && (
                      <p>
                        User: <span className="text-slate-300">{d.displayName}</span> (@{d.username})
                      </p>
                    )}
                    <p className="font-mono text-[10px] text-slate-500 truncate">
                      Key: {d.identityPublicKey?.slice(0, 16)}...
                    </p>
                    <p>Last seen: {new Date(d.lastSeenAt).toLocaleString()}</p>
                  </div>
                </div>

                {d.status === 'active' && (
                  <button
                    onClick={() => handleRevokeDevice(d.id)}
                    title="Revoke Device"
                    className="p-2 text-rose-400 hover:text-rose-300 hover:bg-slate-900 rounded-lg transition-colors flex-shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
