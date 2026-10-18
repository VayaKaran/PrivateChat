import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Room, DevicePublicKeys, EncryptedMessageEnvelope, DecryptedMessagePayload } from '@privatechat/shared';
import { useAuth } from './AuthContext.js';
import { useCrypto } from './CryptoContext.js';
import { useSocket } from './SocketContext.js';
import { apiFetch } from '../utils/api.js';

export interface DisplayMessage {
  envelope: EncryptedMessageEnvelope;
  decrypted: DecryptedMessagePayload | null;
  decryptionError?: string | null;
}

interface ChatContextType {
  rooms: Room[];
  activeRoomId: string | null;
  activeRoom: Room | null;
  messages: DisplayMessage[];
  recipientDevices: DevicePublicKeys[];
  isLoadingRooms: boolean;
  isLoadingMessages: boolean;
  typingUsers: Record<string, string>; // userId -> displayName
  onlinePresence: Record<string, { status: 'online' | 'offline'; lastSeenAt: number }>;
  setActiveRoomId: (id: string | null) => void;
  refreshRooms: () => Promise<void>;
  createRoom: (name: string, type: 'direct' | 'group', memberUserIds: string[]) => Promise<string>;
  sendMessage: (text: string, replyToMessageId?: string | null) => Promise<void>;
  editMessage: (messageId: string, text: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  sendTyping: (isTyping: boolean) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, csrfToken } = useAuth();
  const { isKeysUnlocked, encryptMessage, decryptMessage } = useCrypto();
  const { subscribeToRoom, unsubscribeFromRoom, sendWsMessage, addMessageHandler } = useSocket();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [recipientDevices, setRecipientDevices] = useState<DevicePublicKeys[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState<boolean>(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [onlinePresence, setOnlinePresence] = useState<Record<string, { status: 'online' | 'offline'; lastSeenAt: number }>>({});

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || null;

  const refreshRooms = useCallback(async () => {
    if (!user) return;
    setIsLoadingRooms(true);
    try {
      const res = await apiFetch('/api/rooms');
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms);
        if (!activeRoomId && data.rooms.length > 0) {
          setActiveRoomId(data.rooms[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load rooms', err);
    } finally {
      setIsLoadingRooms(false);
    }
  }, [user, activeRoomId]);

  useEffect(() => {
    refreshRooms();
  }, [refreshRooms]);

  // Load active room details, recipient devices, and messages
  useEffect(() => {
    if (!activeRoomId || !user) return;

    subscribeToRoom(activeRoomId);
    let isCancelled = false;

    const loadRoomDetails = async () => {
      setIsLoadingMessages(true);
      try {
        // 1. Fetch room details and active recipient device public keys
        const roomRes = await apiFetch(`/api/rooms/${activeRoomId}`);
        if (roomRes.ok) {
          const roomData = await roomRes.json();
          if (!isCancelled) {
            setRecipientDevices(roomData.recipientDevices || []);
          }
        }

        // 2. Fetch encrypted message history
        const msgRes = await apiFetch(`/api/messages/${activeRoomId}?limit=50`);
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          const envelopes: EncryptedMessageEnvelope[] = msgData.messages || [];

          if (!isCancelled) {
            // Decrypt envelopes if keys unlocked
            const displayList: DisplayMessage[] = [];
            for (const env of envelopes) {
              if (env.isDeleted) {
                displayList.push({
                  envelope: env,
                  decrypted: { text: '[Message deleted]', timestamp: env.createdAt },
                });
                continue;
              }

              if (!isKeysUnlocked) {
                displayList.push({ envelope: env, decrypted: null });
                continue;
              }

              // Find sender device public keys
              const senderDev = recipientDevices.find((d) => d.id === env.senderDeviceId);
              if (senderDev) {
                try {
                  const dec = await decryptMessage(env, senderDev);
                  displayList.push({ envelope: env, decrypted: dec });
                } catch (err: any) {
                  displayList.push({ envelope: env, decrypted: null, decryptionError: err.message });
                }
              } else {
                displayList.push({
                  envelope: env,
                  decrypted: null,
                  decryptionError: 'Sender device public key not found.',
                });
              }
            }
            setMessages(displayList);
          }
        }
      } catch (err) {
        console.error('Failed to load room messages', err);
      } finally {
        if (!isCancelled) setIsLoadingMessages(false);
      }
    };

    loadRoomDetails();

    return () => {
      isCancelled = true;
      unsubscribeFromRoom(activeRoomId);
      setTypingUsers({});
    };
  }, [activeRoomId, user, isKeysUnlocked, subscribeToRoom, unsubscribeFromRoom, decryptMessage]);

  // Handle incoming real-time WebSocket events
  useEffect(() => {
    const unsubscribe = addMessageHandler(async (msg) => {
      switch (msg.type) {
        case 'message:new': {
          if (msg.message.roomId === activeRoomId) {
            const env = msg.message;
            if (env.isDeleted) {
              setMessages((prev) => [
                ...prev,
                { envelope: env, decrypted: { text: '[Message deleted]', timestamp: env.createdAt } },
              ]);
              return;
            }

            if (!isKeysUnlocked) {
              setMessages((prev) => [...prev, { envelope: env, decrypted: null }]);
              return;
            }

            const senderDev = recipientDevices.find((d) => d.id === env.senderDeviceId);
            if (senderDev) {
              try {
                const dec = await decryptMessage(env, senderDev);
                setMessages((prev) => [...prev, { envelope: env, decrypted: dec }]);
              } catch (err: any) {
                setMessages((prev) => [
                  ...prev,
                  { envelope: env, decrypted: null, decryptionError: err.message },
                ]);
              }
            } else {
              setMessages((prev) => [
                ...prev,
                { envelope: env, decrypted: null, decryptionError: 'Sender key not found' },
              ]);
            }
          }
          break;
        }

        case 'message:updated': {
          if (msg.message.roomId === activeRoomId) {
            const env = msg.message;
            const senderDev = recipientDevices.find((d) => d.id === env.senderDeviceId);
            if (senderDev && isKeysUnlocked) {
              try {
                const dec = await decryptMessage(env, senderDev);
                setMessages((prev) =>
                  prev.map((m) => (m.envelope.id === env.id ? { envelope: env, decrypted: dec } : m))
                );
              } catch {
                // ignore
              }
            }
          }
          break;
        }

        case 'message:deleted': {
          if (msg.roomId === activeRoomId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.envelope.id === msg.messageId
                  ? {
                      envelope: { ...m.envelope, isDeleted: true },
                      decrypted: { text: '[Message deleted]', timestamp: m.envelope.createdAt },
                    }
                  : m
              )
            );
          }
          break;
        }

        case 'typing:status': {
          if (msg.roomId === activeRoomId) {
            setTypingUsers((prev) => {
              const next = { ...prev };
              if (msg.isTyping) {
                next[msg.userId] = msg.displayName;
              } else {
                delete next[msg.userId];
              }
              return next;
            });
          }
          break;
        }

        case 'presence:update': {
          setOnlinePresence((prev) => ({
            ...prev,
            [msg.userId]: { status: msg.status, lastSeenAt: msg.lastSeenAt },
          }));
          break;
        }
      }
    });

    return () => unsubscribe();
  }, [activeRoomId, isKeysUnlocked, recipientDevices, decryptMessage, addMessageHandler]);

  const createRoom = async (name: string, type: 'direct' | 'group', memberUserIds: string[]) => {
    if (!csrfToken) throw new Error('CSRF token missing');
    const res = await apiFetch('/api/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ name, type, memberUserIds }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create room');
    }

    const data = await res.json();
    await refreshRooms();
    setActiveRoomId(data.room.id);
    return data.room.id;
  };

  const sendMessage = async (text: string, replyToMessageId?: string | null) => {
    if (!activeRoomId || !csrfToken) return;

    const payload: DecryptedMessagePayload = {
      text,
      timestamp: Date.now(),
    };

    // 1. Client-side End-to-End Encryption
    const encrypted = await encryptMessage(payload, recipientDevices);

    // 2. Transmit ciphertext envelope to backend
    const res = await apiFetch('/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        roomId: activeRoomId,
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        keyEnvelopes: encrypted.keyEnvelopes,
        signature: encrypted.signature,
        replyToMessageId: replyToMessageId || null,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to send message');
    }

    // Stop typing indicator on message sent
    sendTyping(false);
  };

  const editMessage = async (messageId: string, text: string) => {
    if (!csrfToken) return;
    const payload: DecryptedMessagePayload = {
      text,
      timestamp: Date.now(),
    };
    const encrypted = await encryptMessage(payload, recipientDevices);

    const res = await apiFetch(`/api/messages/${messageId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        keyEnvelopes: encrypted.keyEnvelopes,
        signature: encrypted.signature,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to edit message');
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!csrfToken) return;
    const res = await apiFetch(`/api/messages/${messageId}`, {
      method: 'DELETE',
      headers: {
        'X-CSRF-Token': csrfToken,
      },
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete message');
    }
  };

  const sendTyping = (isTyping: boolean) => {
    if (!activeRoomId) return;
    sendWsMessage({
      type: 'typing',
      roomId: activeRoomId,
      isTyping,
    });
  };

  return (
    <ChatContext.Provider
      value={{
        rooms,
        activeRoomId,
        activeRoom,
        messages,
        recipientDevices,
        isLoadingRooms,
        isLoadingMessages,
        typingUsers,
        onlinePresence,
        setActiveRoomId,
        refreshRooms,
        createRoom,
        sendMessage,
        editMessage,
        deleteMessage,
        sendTyping,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within a ChatProvider');
  return context;
};
