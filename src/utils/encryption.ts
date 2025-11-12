/**
 * Encryption utilities using Web Crypto API for secrets
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

/**
 * Derives an encryption key from a password
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates a random salt
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Generates a random IV (initialization vector)
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

/**
 * Encrypts data using AES-GCM
 */
export async function encrypt(data: string, password: string): Promise<string> {
  try {
    const salt = generateSalt();
    const iv = generateIV();
    const key = await deriveKey(password, salt);
    
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);
    
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv as any,
      },
      key,
      encodedData
    );

    // Combine salt + iv + encrypted data
    const encryptedArray = new Uint8Array(encryptedBuffer);
    const combined = new Uint8Array(salt.length + iv.length + encryptedArray.length);
    combined.set(salt as any, 0);
    combined.set(iv as any, salt.length);
    combined.set(encryptedArray, salt.length + iv.length);

    // Convert to base64
    return btoa(String.fromCharCode(...Array.from(combined)));
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts data using AES-GCM
 */
export async function decrypt(encryptedData: string, password: string): Promise<string> {
  try {
    // Convert from base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // Extract salt, iv, and encrypted data
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const data = combined.slice(28);
    
    const key = await deriveKey(password, salt);
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv as any,
      },
      key,
      data as any
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Generates a device-specific encryption key
 */
export async function getDeviceKey(): Promise<string> {
  const stored = await chrome.storage.local.get('deviceKey');
  
  if (stored.deviceKey) {
    return stored.deviceKey;
  }
  
  // Generate a new device key
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  await chrome.storage.local.set({ deviceKey: key });
  return key;
}
