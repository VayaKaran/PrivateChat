import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ArrowDown, Shield, Users, Lock } from 'lucide-react';
import { Header } from '../components/layout/Header.js';
import { Sidebar } from '../components/layout/Sidebar.js';
import { ConversationHeader } from '../components/chat/ConversationHeader.js';
import { MessageBubble } from '../components/chat/MessageBubble.js';
import { MessageInput } from '../components/chat/MessageInput.js';
import { NewRoomModal } from '../components/chat/NewRoomModal.js';
import { SafetyNumberModal } from '../components/chat/SafetyNumberModal.js';
import { AdminModal } from './AdminModal.js';
import { SettingsModal } from './SettingsModal.js';
import { ThreatModelView } from './ThreatModelView.js';
import { KeyUnlockModal } from './KeyUnlockModal.js';
import { useChat, DisplayMessage } from '../context/ChatContext.js';
import { useCrypto } from '../context/CryptoContext.js';
import { useAuth } from '../context/AuthContext.js';

export const ChatView: React.FC = () => {
  const { user } = useAuth();
  const {
    activeRoom,
    messages,
    isLoadingMessages,
    typingUsers,
  } = useChat();
  const { isKeysUnlocked } = useCrypto();

  // Modals state
  const [isNewRoomOpen, setIsNewRoomOpen] = useState(false);
  const [isSafetyNumberOpen, setIsSafetyNumberOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isThreatModelOpen, setIsThreatModelOpen] = useState(false);
  const [isKeyUnlockOpen, setIsKeyUnlockOpen] = useState(false);

  // Message reply target
  const [replyingTo, setReplyingTo] = useState<DisplayMessage | null>(null);

  // Scroll to bottom handling
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    scrollToBottom(false);
  }, [activeRoom?.id]);

  useEffect(() => {
    // If user is near bottom, automatically scroll to bottom on new message
    if (!showScrollBottom) {
      scrollToBottom(true);
    }
  }, [messages.length]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isFarFromBottom = scrollHeight - scrollTop - clientHeight > 150;
    setShowScrollBottom(isFarFromBottom);
  };

  // Typing status text (exclude current user)
  const typingNames = Object.entries(typingUsers)
    .filter(([uid]) => uid !== user?.id)
    .map(([, name]) => name);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 antialiased select-text">
      {/* Top Application Header */}
      <Header
        onOpenAdmin={() => setIsAdminOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenThreatModel={() => setIsThreatModelOpen(true)}
        onOpenKeyUnlock={() => setIsKeyUnlockOpen(true)}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Conversations & Rooms */}
        <Sidebar onOpenNewRoom={() => setIsNewRoomOpen(true)} />

        {/* Right Active Conversation Area */}
        <main className="flex-1 flex flex-col bg-slate-950/60 overflow-hidden relative">
          {activeRoom ? (
            <>
              {/* Conversation Top Bar */}
              <ConversationHeader
                onOpenSafetyNumbers={() => setIsSafetyNumberOpen(true)}
              />

              {/* Messages Scroll Area */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-1 relative"
              >
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
                      <span>Decrypting end-to-end conversation...</span>
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 text-xs p-6">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 mb-3">
                      <Shield size={24} className="text-cyan-500/80" />
                    </div>
                    <p className="font-semibold text-slate-300 text-sm">End-to-End Encrypted Channel</p>
                    <p className="max-w-xs mt-1 text-slate-500 text-[11px]">
                      Messages sent in this room are encrypted on your device and can only be decrypted by authorized room members.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Security Notice Pill at Top of Room */}
                    <div className="flex justify-center mb-6">
                      <span className="px-3 py-1 bg-slate-900/90 border border-slate-800 rounded-full text-[10px] text-cyan-300/80 flex items-center gap-1.5 shadow-sm">
                        <Lock size={10} />
                        <span>Messages and calls are end-to-end encrypted. No one outside of this chat can read them.</span>
                      </span>
                    </div>

                    {messages.map((m) => (
                      <MessageBubble
                        key={m.envelope.id}
                        message={m}
                        onReply={(msg) => setReplyingTo(msg)}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Typing Indicators */}
              <AnimatePresence>
                {typingNames.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="px-6 py-1 text-[11px] text-cyan-400 italic flex items-center gap-2"
                  >
                    <span className="flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.4s]" />
                    </span>
                    <span>
                      {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing...
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Jump to bottom Floating Button */}
              {showScrollBottom && (
                <button
                  onClick={() => scrollToBottom(true)}
                  className="absolute bottom-20 right-6 p-2 rounded-full bg-slate-800/90 border border-slate-700 text-slate-200 hover:text-white shadow-xl transition-all hover:scale-105 active:scale-95"
                  title="Scroll to bottom"
                >
                  <ArrowDown size={16} />
                </button>
              )}

              {/* Message Composer */}
              <MessageInput
                replyingTo={replyingTo}
                onClearReply={() => setReplyingTo(null)}
                onOpenKeyUnlock={() => setIsKeyUnlockOpen(true)}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500">
              <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-4 shadow-xl">
                <MessageSquare size={32} className="text-cyan-500/40" />
              </div>
              <h3 className="font-bold text-slate-200 text-base">Select a conversation</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Choose a conversation from the sidebar or click the plus button to start an encrypted channel with an authorized member.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* App Modals */}
      <NewRoomModal isOpen={isNewRoomOpen} onClose={() => setIsNewRoomOpen(false)} />
      <SafetyNumberModal isOpen={isSafetyNumberOpen} onClose={() => setIsSafetyNumberOpen(false)} />
      <AdminModal isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <ThreatModelView isOpen={isThreatModelOpen} onClose={() => setIsThreatModelOpen(false)} />
      <KeyUnlockModal isOpen={isKeyUnlockOpen} onClose={() => setIsKeyUnlockOpen(false)} />
    </div>
  );
};
