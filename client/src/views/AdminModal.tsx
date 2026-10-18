import React, { useState } from 'react';
import { Users, QrCode, Smartphone, X } from 'lucide-react';
import { Modal } from '../components/ui/Modal.js';
import { InvitationManager } from '../components/admin/InvitationManager.js';
import { MemberManager } from '../components/admin/MemberManager.js';
import { DeviceManager } from '../components/admin/DeviceManager.js';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'invitations' | 'members' | 'devices'>('invitations');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Administration & Security Management" maxWidth="max-w-2xl">
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab('invitations')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'invitations'
                ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode size={14} />
            <span>Invitations</span>
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'members'
                ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users size={14} />
            <span>Members</span>
          </button>
          <button
            onClick={() => setActiveTab('devices')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'devices'
                ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone size={14} />
            <span>Devices</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1">
          {activeTab === 'invitations' && <InvitationManager />}
          {activeTab === 'members' && <MemberManager />}
          {activeTab === 'devices' && <DeviceManager />}
        </div>
      </div>
    </Modal>
  );
};
