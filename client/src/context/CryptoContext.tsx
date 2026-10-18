import React, { createContext, useContext, useState, useEffect } from 'react';
import { StoredDeviceKeys, loadDeviceKeys, saveDeviceKeys, hasStoredKeys, clearStoredKeys } from '../crypto/keyStore.js';
import { encryptMessagePayload, decryptMessageEnvelope, generateDeviceKeys, GeneratedKeyBundle } from '../crypto/e2ee.js';
import { DevicePublicKeys, EncryptedMessageEnvelope, DecryptedMessagePayload } from '@privatechat/shared';

interface CryptoContextType {
  isKeysUnlocked: boolean;
  hasExistingKeys: boolean;
  deviceKeys: StoredDeviceKeys | null;
  unlockKeys: (passphrase: string) => Promise<boolean>;
  storeAndUnlockKeys: (keys: StoredDeviceKeys, passphrase: string) => Promise<void>;
  createKeyBundle: () => Promise<GeneratedKeyBundle>;
  encryptMessage: (
    payload: DecryptedMessagePayload,
    recipientDevices: DevicePublicKeys[]
  ) => Promise<{
    ciphertext: string;
    nonce: string;
    keyEnvelopes: Record<string, string>;
    signature: string;
  }>;
  decryptMessage: (
    envelope: EncryptedMessageEnvelope,
    senderDevice: DevicePublicKeys
  ) => Promise<DecryptedMessagePayload>;
  lockKeys: () => void;
  resetAllKeys: () => Promise<void>;
}

const CryptoContext = createContext<CryptoContextType | undefined>(undefined);

export const CryptoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deviceKeys, setDeviceKeys] = useState<StoredDeviceKeys | null>(null);
  const [hasExistingKeys, setHasExistingKeys] = useState<boolean>(false);
  // Cache of messageId -> DecryptedMessagePayload
  const [decryptionCache] = useState<Map<string, DecryptedMessagePayload>>(new Map());

  useEffect(() => {
    hasStoredKeys().then(setHasExistingKeys);
  }, []);

  const unlockKeys = async (passphrase: string): Promise<boolean> => {
    try {
      const keys = await loadDeviceKeys(passphrase);
      if (keys) {
        setDeviceKeys(keys);
        setHasExistingKeys(true);
        return true;
      }
    } catch {
      // wrong passphrase
    }
    return false;
  };

  const storeAndUnlockKeys = async (keys: StoredDeviceKeys, passphrase: string) => {
    await saveDeviceKeys(keys, passphrase);
    setDeviceKeys(keys);
    setHasExistingKeys(true);
  };

  const createKeyBundle = async (): Promise<GeneratedKeyBundle> => {
    return await generateDeviceKeys();
  };

  const encryptMessage = async (
    payload: DecryptedMessagePayload,
    recipientDevices: DevicePublicKeys[]
  ) => {
    if (!deviceKeys) {
      throw new Error('Device keys are locked or not initialized.');
    }
    return await encryptMessagePayload(payload, recipientDevices, deviceKeys);
  };

  const decryptMessage = async (
    envelope: EncryptedMessageEnvelope,
    senderDevice: DevicePublicKeys
  ): Promise<DecryptedMessagePayload> => {
    if (!deviceKeys) {
      throw new Error('Device keys are locked.');
    }

    if (decryptionCache.has(envelope.id)) {
      return decryptionCache.get(envelope.id)!;
    }

    const decrypted = await decryptMessageEnvelope(envelope, senderDevice, deviceKeys);
    decryptionCache.set(envelope.id, decrypted);
    return decrypted;
  };

  const lockKeys = () => {
    setDeviceKeys(null);
    decryptionCache.clear();
  };

  const resetAllKeys = async () => {
    await clearStoredKeys();
    setDeviceKeys(null);
    setHasExistingKeys(false);
    decryptionCache.clear();
  };

  return (
    <CryptoContext.Provider
      value={{
        isKeysUnlocked: !!deviceKeys,
        hasExistingKeys,
        deviceKeys,
        unlockKeys,
        storeAndUnlockKeys,
        createKeyBundle,
        encryptMessage,
        decryptMessage,
        lockKeys,
        resetAllKeys,
      }}
    >
      {children}
    </CryptoContext.Provider>
  );
};

export const useCrypto = () => {
  const context = useContext(CryptoContext);
  if (!context) throw new Error('useCrypto must be used within a CryptoProvider');
  return context;
};
