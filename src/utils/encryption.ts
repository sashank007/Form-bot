/**
 * Encryption utilities (DISABLED - Simplified for now)
 * To re-enable encryption, implement these functions using Web Crypto API
 */

// Placeholder functions - not currently used
export async function encrypt(data: string, password: string): Promise<string> {
  return data;
}

export async function decrypt(encryptedData: string, password: string): Promise<string> {
  return encryptedData;
}

export async function getDeviceKey(): Promise<string> {
  return 'device-key-placeholder';
}
