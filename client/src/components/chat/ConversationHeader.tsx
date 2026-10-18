import React from 'react';
import { Shield, ShieldCheck, Users, Info, KeyRound } from 'lucide-react';
import { useChat } from '../../context/ChatContext.js';
import { useAuth } from '../../context/AuthContext.js';

interface ConversationHeaderProps {
  onOpenSafetyNumbers: () => void;
  onOpenRoomInfo?: () => void;
}

export const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  onOpenSafetyNumbers,
}) => {
  const { activeRoom, recipientDevices } = useChat();
  const { user } = useAuth();

  if (!activeRoom) return null;

  const isDirect = activeRoom.type === 'direct';
  const otherMember = isDirect ? activeRoom.members.find((m) => m.userId !== user?.id) : null;

  return (
    <div className="h-14 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between z-10 flex-shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-950 to-teal-900 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xs flex-shrink-0">
          {isDirect ? activeRoom.name.charAt(0).toUpperCase() : <Users size={16} />}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-100 truncate flex items-center gap-2">
            <span>{activeRoom.name}</span>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-medium">
              <ShieldCheck size={11} />
              <span>E2EE</span>
            </span>
          </h2>
          <p className="text-[11px] text-slate-400 truncate">
            {isDirect
              ? otherMember
                ? `@${otherMember.username} • 1-on-1 private channel`
                : 'Direct Conversation'
              : `${activeRoom.members.length} members • ${recipientDevices.length} recipient devices`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Safety Number / Fingerprint verification button */}
        {isDirect && otherMember && (
          <button
            onClick={onOpenSafetyNumbers}
            title="Verify Contact Safety Numbers"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            <KeyRound size={13} className="text-cyan-400" />
            <span className="hidden sm:inline">Verify Safety Number</span>
          </button>
        )}
      </div>
    </div>
  );
};
