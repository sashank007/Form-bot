/**
 * Encrypted secrets storage for sensitive data
 */

import { encrypt, decrypt, getDeviceKey } from './encryption';

const STORAGE_KEY = 'formbot_secrets';

export interface Secret {
  id: string;
  name: string;
  value: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Save a secret (encrypted)
 */
export async function saveSecret(secret: Secret): Promise<void> {
  const allSecrets = await getAllSecrets();
  const existingIndex = allSecrets.findIndex(s => s.id === secret.id);
  
  if (existingIndex >= 0) {
    allSecrets[existingIndex] = secret;
  } else {
    allSecrets.push(secret);
  }
  
  const deviceKey = await getDeviceKey();
  const encrypted = await encrypt(JSON.stringify(allSecrets), deviceKey);
  
  await chrome.storage.local.set({ [STORAGE_KEY]: encrypted });
}

/**
 * Get all secrets (decrypted)
 */
export async function getAllSecrets(): Promise<Secret[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const encrypted = result[STORAGE_KEY];
    
    if (!encrypted) {
      return [];
    }
    
    const deviceKey = await getDeviceKey();
    const decrypted = await decrypt(encrypted, deviceKey);
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Failed to get secrets:', error);
    return [];
  }
}

/**
 * Get a secret by ID
 */
export async function getSecretById(id: string): Promise<Secret | null> {
  const secrets = await getAllSecrets();
  return secrets.find(s => s.id === id) || null;
}

/**
 * Delete a secret
 */
export async function deleteSecret(id: string): Promise<void> {
  const secrets = await getAllSecrets();
  const filtered = secrets.filter(s => s.id !== id);
  
  const deviceKey = await getDeviceKey();
  const encrypted = await encrypt(JSON.stringify(filtered), deviceKey);
  
  await chrome.storage.local.set({ [STORAGE_KEY]: encrypted });
}

/**
 * Get secret value by name (for form filling)
 */
export async function getSecretValue(name: string): Promise<string | null> {
  const secrets = await getAllSecrets();
  const secret = secrets.find(s => s.name.toLowerCase() === name.toLowerCase());
  return secret?.value || null;
}

