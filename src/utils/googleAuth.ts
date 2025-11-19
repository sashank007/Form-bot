/**
 * Google Sign-In for Chrome Extension
 */

import { encrypt, decrypt, getDeviceKey } from './encryption';

const STORAGE_KEY = 'formbot_user_auth';

export interface UserAuth {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  signedInAt: number;
}

/**
 * Sign in with Google
 */
export async function signInWithGoogle(): Promise<UserAuth> {
  try {
    console.log('🔐 Starting Google Sign-In...');
    
    // Get OAuth token using Chrome identity API
    const token = await new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });

    console.log('✓ Got auth token');

    // Get user info from Google
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    const userInfo = await response.json();
    console.log('✓ Got user info:', { email: userInfo.email, name: userInfo.name });

    const auth: UserAuth = {
      userId: `google_${userInfo.id}`,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      signedInAt: Date.now(),
    };

    // Store auth (encrypted)
    await saveAuth(auth);

    console.log('✅ Signed in successfully as:', auth.email);
    
    // Register user with Lambda API (automatic)
    try {
      const { LAMBDA_API_URL } = await import('../config/constants');
      const registerUrl = `${LAMBDA_API_URL}/api/user/register`;
      
      console.log('📡 Registering user with Lambda:', registerUrl);
      
      const response = await fetch(registerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: auth.userId,
          email: auth.email,
          name: auth.name,
        }),
      });
      
      if (response.ok) {
        console.log('✓ User registered with backend');
      } else {
        console.error('Backend registration failed:', response.status);
      }
    } catch (error) {
      console.error('Failed to register with backend:', error);
      // Don't fail sign-in if backend registration fails
    }
    
    return auth;
  } catch (error) {
    console.error('❌ Google Sign-In failed:', error);
    throw new Error(`Sign-in failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Sign out
 */
export async function signOut(): Promise<void> {
  try {
    // Remove stored auth
    await chrome.storage.local.remove(STORAGE_KEY);

    // Revoke Chrome identity token
    const token = await new Promise<string>((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        resolve(token || '');
      });
    });

    if (token) {
      await new Promise<void>((resolve) => {
        chrome.identity.removeCachedAuthToken({ token }, () => {
          resolve();
        });
      });
    }

    console.log('✅ Signed out successfully');
  } catch (error) {
    console.error('Sign out error:', error);
  }
}

/**
 * Get current auth
 */
export async function getAuth(): Promise<UserAuth | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const encrypted = result[STORAGE_KEY];

    if (!encrypted) {
      return null;
    }

    const deviceKey = await getDeviceKey();
    const decrypted = await decrypt(encrypted, deviceKey);
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Failed to get auth:', error);
    return null;
  }
}

/**
 * Save auth (encrypted)
 */
async function saveAuth(auth: UserAuth): Promise<void> {
  const deviceKey = await getDeviceKey();
  const encrypted = await encrypt(JSON.stringify(auth), deviceKey);
  await chrome.storage.local.set({ [STORAGE_KEY]: encrypted });
}

/**
 * Check if user is signed in
 */
export async function isSignedIn(): Promise<boolean> {
  const auth = await getAuth();
  return auth !== null;
}

