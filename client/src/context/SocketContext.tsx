import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext.js';
import { ClientWsMessage, ServerWsMessage } from '@privatechat/shared';
import { getWsUrl, getSessionToken } from '../utils/api.js';

type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
type MessageHandler = (msg: ServerWsMessage) => void;

interface SocketContextType {
  connectionState: ConnectionState;
  sendWsMessage: (msg: ClientWsMessage) => void;
  subscribeToRoom: (roomId: string) => void;
  unsubscribeFromRoom: (roomId: string) => void;
  addMessageHandler: (handler: MessageHandler) => () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, csrfToken } = useAuth();
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const subscribedRoomsRef = useRef<Set<string>>(new Set());

  const addMessageHandler = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const sendWsMessage = useCallback((msg: ClientWsMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const subscribeToRoom = useCallback((roomId: string) => {
    subscribedRoomsRef.current.add(roomId);
    sendWsMessage({ type: 'subscribe', roomId });
  }, [sendWsMessage]);

  const unsubscribeFromRoom = useCallback((roomId: string) => {
    subscribedRoomsRef.current.delete(roomId);
    sendWsMessage({ type: 'unsubscribe', roomId });
  }, [sendWsMessage]);

  const connect = useCallback(() => {
    if (!user || !csrfToken) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnectionState('disconnected');
      return;
    }

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setConnectionState(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');

    const wsUrl = getWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState('connected');
      reconnectAttemptRef.current = 0;

      // Authenticate with sessionToken if available (supports cross-origin & non-cookie environments)
      const token = getSessionToken();
      if (token && csrfToken) {
        ws.send(JSON.stringify({ type: 'auth', sessionToken: token, csrfToken }));
      }

      // Resubscribe to any previously tracked rooms
      for (const roomId of subscribedRoomsRef.current) {
        ws.send(JSON.stringify({ type: 'subscribe', roomId }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerWsMessage = JSON.parse(event.data);
        for (const handler of handlersRef.current) {
          handler(msg);
        }
      } catch (err) {
        console.error('Failed to parse incoming WebSocket message', err);
      }
    };

    ws.onclose = (event) => {
      setConnectionState('disconnected');
      wsRef.current = null;

      if (event.code === 4001 || event.code === 4002 || event.code === 4003) {
        // Unauthorized, revoked, or CSRF failure - do not reconnect automatically
        return;
      }

      // Exponential backoff reconnect: 1s, 2s, 4s, 8s, up to 15s max
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 15000);
      reconnectAttemptRef.current += 1;

      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      // Handled by onclose
    };
  }, [user, csrfToken]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return (
    <SocketContext.Provider
      value={{
        connectionState,
        sendWsMessage,
        subscribeToRoom,
        unsubscribeFromRoom,
        addMessageHandler,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
};
