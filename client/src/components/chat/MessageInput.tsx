import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Lock, KeyRound } from 'lucide-react';
import { useChat, DisplayMessage } from '../../context/ChatContext.js';
import { useCrypto } from '../../context/CryptoContext.js';

interface MessageInputProps {
  replyingTo: DisplayMessage | null;
  onClearReply: () => void;
  onOpenKeyUnlock: () => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  replyingTo,
  onClearReply,
  onOpenKeyUnlock,
}) => {
  const { sendMessage, sendTyping } = useChat();
  const { isKeysUnlocked } = useCrypto();

  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);

    // Send typing event
    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(false);
    }, 2000);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim() || isSending || !isKeysUnlocked) return;

    setIsSending(true);
    try {
      await sendMessage(text.trim(), replyingTo ? replyingTo.envelope.id : null);
      setText('');
      onClearReply();
      sendTyping(false);
    } catch (err: any) {
      alert(err.message || 'Failed to send encrypted message');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isKeysUnlocked) {
    return (
      <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 text-xs text-amber-300">
        <div className="flex items-center gap-2">
          <Lock size={16} />
          <span>Device encryption keys are locked. Unlock your key vault to send or read messages.</span>
        </div>
        <button
          onClick={onOpenKeyUnlock}
          className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold border border-amber-500/40 rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0"
        >
          <KeyRound size={13} />
          <span>Unlock Key Vault</span>
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 bg-slate-900 border-t border-slate-800 flex-shrink-0">
      {/* Reply Preview Banner */}
      {replyingTo && (
        <div className="mb-2 px-3 py-1.5 bg-slate-800/80 border-l-2 border-cyan-400 rounded-r-lg flex items-center justify-between text-xs text-slate-300">
          <div className="truncate">
            <span className="font-semibold text-cyan-400">Replying to: </span>
            <span className="truncate italic">
              {replyingTo.decrypted ? replyingTo.decrypted.text : 'Encrypted message'}
            </span>
          </div>
          <button
            onClick={onClearReply}
            className="p-1 text-slate-400 hover:text-white rounded"
            title="Cancel reply"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSend} className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="Type an encrypted message..."
          disabled={isSending}
          className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
        />

        <button
          type="submit"
          disabled={!text.trim() || isSending}
          className="p-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 disabled:hover:bg-cyan-500 text-slate-950 rounded-xl transition-all shadow-md shadow-cyan-500/20 active:scale-95 flex-shrink-0"
          title="Send Encrypted Message"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};
