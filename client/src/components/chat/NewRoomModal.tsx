import React, { useState, useEffect } from 'react';
import { Users, User as UserIcon, MessageSquarePlus } from 'lucide-react';
import { Modal } from '../ui/Modal.js';
import { Input } from '../ui/Input.js';
import { Button } from '../ui/Button.js';
import { useChat } from '../../context/ChatContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { User } from '@privatechat/shared';
import { apiFetch } from '../../utils/api.js';

interface NewRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewRoomModal: React.FC<NewRoomModalProps> = ({ isOpen, onClose }) => {
  const { createRoom } = useChat();
  const { user: currentUser } = useAuth();

  const [type, setType] = useState<'direct' | 'group'>('direct');
  const [name, setName] = useState('');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchUsers = async () => {
      setIsLoadingUsers(true);
      setError(null);
      try {
        const res = await apiFetch('/api/users');
        if (res.ok) {
          const data = await res.json();
          // Filter out current user
          const others = (data.users || []).filter((u: User) => u.id !== currentUser?.id && u.status === 'active');
          setAvailableUsers(others);
        }
      } catch {
        setError('Failed to load registered users');
      } finally {
        setIsLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [isOpen, currentUser]);

  const toggleSelectUser = (uid: string) => {
    if (type === 'direct') {
      setSelectedUserIds([uid]);
    } else {
      setSelectedUserIds((prev) =>
        prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
      );
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedUserIds.length === 0) {
      setError('Please select at least one contact.');
      return;
    }

    let roomName = name.trim();
    if (type === 'direct') {
      const target = availableUsers.find((u) => u.id === selectedUserIds[0]);
      roomName = target?.displayName || 'Direct Chat';
    } else if (!roomName) {
      setError('Please provide a name for the group.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createRoom(roomName, type, selectedUserIds);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create conversation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Conversation" maxWidth="max-w-md">
      <form onSubmit={handleCreate} className="space-y-4">
        {/* Type Selector */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setType('direct');
              setSelectedUserIds([]);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              type === 'direct' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserIcon size={14} />
            <span>Direct 1-on-1</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setType('group');
              setSelectedUserIds([]);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              type === 'group' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users size={14} />
            <span>Private Group</span>
          </button>
        </div>

        {/* Group Name (Only for groups) */}
        {type === 'group' && (
          <Input
            label="Group Name"
            placeholder="e.g. Core Research Team"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}

        {/* Contacts List */}
        <div>
          <label className="text-xs font-semibold text-slate-300 tracking-wide uppercase block mb-1.5">
            {type === 'direct' ? 'Select Contact' : 'Select Members'}
          </label>
          <div className="max-h-52 overflow-y-auto space-y-1 p-2 bg-slate-950 border border-slate-800 rounded-xl">
            {isLoadingUsers ? (
              <p className="text-xs text-slate-500 text-center py-4">Loading authorized members...</p>
            ) : availableUsers.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-500">
                <p>No other authorized members found.</p>
                <p className="mt-1 text-[11px] text-slate-600">
                  Generate an invitation from the admin menu to add new people.
                </p>
              </div>
            ) : (
              availableUsers.map((u) => {
                const isSelected = selectedUserIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleSelectUser(u.id)}
                    className={`w-full p-2.5 rounded-lg flex items-center justify-between text-left transition-colors ${
                      isSelected
                        ? 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-200'
                        : 'hover:bg-slate-900 border border-transparent text-slate-300'
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-xs text-slate-200">{u.displayName}</p>
                      <p className="text-[10px] text-slate-500">@{u.username}</p>
                    </div>
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-500 text-slate-950'
                          : 'border-slate-700 bg-transparent'
                      }`}
                    >
                      {isSelected && '✓'}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={selectedUserIds.length === 0}>
            Start Conversation
          </Button>
        </div>
      </form>
    </Modal>
  );
};
