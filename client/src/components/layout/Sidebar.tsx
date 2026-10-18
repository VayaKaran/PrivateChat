import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Users, Plus, Search, ShieldCheck } from 'lucide-react';
import { useChat } from '../../context/ChatContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { Room } from '@privatechat/shared';

interface SidebarProps {
  onOpenNewRoom: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenNewRoom }) => {
  const { rooms, activeRoomId, setActiveRoomId, onlinePresence, isLoadingRooms } = useChat();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <aside className="w-full md:w-80 lg:w-96 bg-slate-900 border-r border-slate-800 flex flex-col h-[calc(100vh-4rem)] select-none">
      {/* Search and Action Bar */}
      <div className="p-3 border-b border-slate-800 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <button
          onClick={onOpenNewRoom}
          title="New Conversation"
          className="p-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold transition-all shadow-md shadow-cyan-500/20 active:scale-95"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoadingRooms ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-slate-800 rounded w-1/2" />
                  <div className="h-2 bg-slate-800/60 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs">
            <MessageSquare size={28} className="mx-auto mb-2 opacity-40 text-slate-400" />
            <p>No conversations found.</p>
            <p className="mt-1">Click the + button above to start a conversation.</p>
          </div>
        ) : (
          filteredRooms.map((room) => {
            const isActive = room.id === activeRoomId;
            const isDirect = room.type === 'direct';
            // Find other participant in 1-on-1 for presence
            const otherMember = isDirect
              ? room.members.find((m) => m.userId !== user?.id)
              : null;
            const isOtherOnline = otherMember
              ? onlinePresence[otherMember.userId]?.status === 'online'
              : false;

            return (
              <button
                key={room.id}
                onClick={() => setActiveRoomId(room.id)}
                className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors relative group ${
                  isActive ? 'bg-cyan-950/40 text-white border border-cyan-500/30' : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                }`}
              >
                {/* Avatar with Presence Indicator */}
                <div className="relative flex-shrink-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                      isDirect
                        ? 'bg-gradient-to-tr from-slate-700 to-slate-600 text-slate-200'
                        : 'bg-gradient-to-tr from-cyan-900 to-teal-800 text-cyan-300'
                    }`}
                  >
                    {isDirect ? (
                      room.name.charAt(0).toUpperCase()
                    ) : (
                      <Users size={18} />
                    )}
                  </div>
                  {isDirect && (
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
                        isOtherOnline ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs sm:text-sm truncate">{room.name}</span>
                    {room.lastMessage && (
                      <span className="text-[10px] text-slate-500 flex-shrink-0">
                        {new Date(room.lastMessage.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500 truncate">
                    <ShieldCheck size={12} className="text-cyan-500/80 flex-shrink-0" />
                    <span className="truncate">
                      {room.lastMessage
                        ? room.lastMessage.isDeleted
                          ? 'Message deleted'
                          : 'Encrypted message'
                        : isDirect
                        ? 'Direct E2EE chat'
                        : `${room.members.length} members`}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Current User Quick Bar */}
      {user && (
        <div className="p-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold text-xs">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{user.displayName}</p>
              <p className="text-[10px] text-slate-500 truncate">@{user.username}</p>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-slate-800 text-slate-400 border border-slate-700">
            {user.role}
          </span>
        </div>
      )}
    </aside>
  );
};
