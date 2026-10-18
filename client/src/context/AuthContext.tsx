import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, DevicePublicKeys } from '@privatechat/shared';
import { apiFetch, setSessionToken } from '../utils/api.js';

interface AuthContextType {
  user: User | null;
  device: DevicePublicKeys | null;
  csrfToken: string | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  checkAuth: () => Promise<void>;
  checkSetupStatus: () => Promise<boolean>;
  logout: () => Promise<void>;
  setAuthSession: (user: User, device: DevicePublicKeys, csrfToken: string, sessionToken?: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [device, setDevice] = useState<DevicePublicKeys | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const checkSetupStatus = async (): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/setup/status');
      if (res.ok) {
        const data = await res.json();
        setIsInitialized(data.isInitialized);
        return data.isInitialized;
      }
    } catch {
      // offline or error
    }
    return true;
  };

  const checkAuth = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const init = await checkSetupStatus();
      if (!init) {
        setIsLoading(false);
        return;
      }

      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setDevice(data.device);
        setCsrfToken(data.csrfToken);
      } else {
        setUser(null);
        setDevice(null);
        setCsrfToken(null);
      }
    } catch (err: any) {
      setUser(null);
      setDevice(null);
      setCsrfToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const setAuthSession = (u: User, d: DevicePublicKeys, csrf: string, token?: string) => {
    setUser(u);
    setDevice(d);
    setCsrfToken(csrf);
    setIsInitialized(true);
    if (token) {
      setSessionToken(token);
    }
  };

  const logout = async () => {
    try {
      if (csrfToken) {
        await apiFetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'X-CSRF-Token': csrfToken,
          },
        });
      }
    } catch {
      // ignore
    } finally {
      setUser(null);
      setDevice(null);
      setCsrfToken(null);
      setSessionToken(null);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        device,
        csrfToken,
        isInitialized,
        isLoading,
        error,
        checkAuth,
        checkSetupStatus,
        logout,
        setAuthSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
