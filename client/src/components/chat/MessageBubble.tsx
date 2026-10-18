import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Lock, Reply, Edit2, Trash2 } from 'lucide-react';
import { DisplayMessage, useChat } from '../../context/ChatContext.js';
import { useAuth } from '../../context/AuthContext.js';

interface MessageBubbleProps {
  message: DisplayMessage;
  onReply: (message: DisplayMessage) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onReply }) => {
  const { user } = useAuth();
  const { editMessage, deleteMessage, activeRoom } = useChat();

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.decrypted?.text || '');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const isMe = user && message.envelope.senderUserId === user.id;
  const isDeleted = message.envelope.isDeleted;
  const isOwnerOrAdmin = user && ['owner', 'admin'].includes(user.role);
  const canDelete = isMe || isOwnerOrAdmin;

  const senderMember = activeRoom?.members.find((m) => m.userId === message.envelope.senderUserId);
  const senderName = isMe ? 'You' : senderMember?.displayName || 'Unknown';

  const handleSaveEdit = async () => {
    if (!editText.trim()) return;
    setIsSubmittingEdit(true);
    try {
      await editMessage(message.envelope.id, editText.trim());
      setIsEditing(false);
    } catch (err: any) {
      alert(err.message || 'Failed to edit message');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
      await deleteMessage(message.envelope.id);
    } catch (err: any) {
      alert(err.message || 'Failed to delete message');
    }
  };

  const timeStr = new Date(message.envelope.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`flex flex-col mb-3 group ${isMe ? 'items-end' : 'items-start'}`}
    >
      {/* Sender Header */}
      {!isMe && (
        <span className="text-[11px] font-semibold text-slate-400 mb-1 ml-1 select-none">
          {senderName}
        </span>
      )}

      {/* Bubble Container */}
      <div className="relative max-w-[85%] sm:max-w-md lg:max-w-lg">
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-sm break-words relative shadow-md ${
            isMe
              ? 'bg-cyan-700 text-white rounded-br-xs'
              : 'bg-slate-800 text-slate-100 rounded-bl-xs border border-slate-700/60'
          } ${isDeleted ? 'italic text-slate-400 opacity-80' : ''}`}
        >
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-cyan-400"
                rows={2}
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-2 py-1 text-xs text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={isSubmittingEdit}
                  className="px-2.5 py-1 text-xs bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold rounded"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div>
              {message.decrypted ? (
                <p className="whitespace-pre-wrap">{message.decrypted.text}</p>
              ) : message.decryptionError ? (
                <div className="flex items-center gap-1.5 text-rose-300 text-xs">
                  <Lock size={13} className="flex-shrink-0" />
                  <span>Unable to decrypt ({message.decryptionError})</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-slate-400 text-xs italic">
                  <Lock size={13} className="animate-pulse" />
                  <span>Encrypted message (unlock keys to view)</span>
                </div>
              )}

              {/* Timestamp & Flags */}
              <div
                className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] select-none ${
                  isMe ? 'text-cyan-200/80' : 'text-slate-400'
                }`}
              >
                {message.envelope.isEdited && <span>(edited)</span>}
                <span>{timeStr}</span>
                <span title="Verified End-to-End Encrypted">
                  <ShieldCheck size={11} className="text-current opacity-75" />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Hover Action Menu */}
        {!isDeleted && !isEditing && (
          <div
            className={`absolute top-0 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-slate-900 border border-slate-700 rounded-lg shadow-lg p-0.5 z-10 ${
              isMe ? 'right-2 -translate-x-full' : 'left-full ml-1'
            }`}
          >
            <button
              onClick={() => onReply(message)}
              title="Reply"
              className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
            >
              <Reply size={13} />
            </button>
            {isMe && (
              <button
                onClick={() => {
                  setEditText(message.decrypted?.text || '');
                  setIsEditing(true);
                }}
                title="Edit message"
                className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
              >
                <Edit2 size={13} />
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                title="Delete message"
                className="p-1 rounded hover:bg-slate-800 text-rose-400 hover:text-rose-300"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
