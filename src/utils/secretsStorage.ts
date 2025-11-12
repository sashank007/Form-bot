/**
 * Profile-based encrypted secrets storage
 */

import { encrypt, decrypt, getDeviceKey } from './encryption';
import { getFormDataById, saveFormData } from './storage';

export interface Secret {
  name: string;
  value: string;
}

/**
 * Save secrets for a profile (encrypted)
 */
export async function saveProfileSecrets(profileId: string, secrets: { [key: string]: string }): Promise<void> {
  const profile = await getFormDataById(profileId);
  if (!profile) {
    throw new Error('Profile not found');
  }

  // Encrypt secrets
  const deviceKey = await getDeviceKey();
  const secretsJson = JSON.stringify(secrets);
  const encrypted = await encrypt(secretsJson, deviceKey);

  // Save encrypted secrets to profile
  profile.secrets = { _encrypted: encrypted };
  await saveFormData(profile);
}

/**
 * Get secrets for a profile (decrypted)
 */
export async function getProfileSecrets(profileId: string): Promise<{ [key: string]: string }> {
  try {
    const profile = await getFormDataById(profileId);
    if (!profile || !profile.secrets) {
      return {};
    }

    const encrypted = (profile.secrets as any)._encrypted;
    if (!encrypted) {
      return {};
    }

    const deviceKey = await getDeviceKey();
    const decrypted = await decrypt(encrypted, deviceKey);

    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Failed to get profile secrets:', error);
    return {};
  }
}

/**
 * Add or update a secret for a profile
 */
export async function saveSecretToProfile(profileId: string, name: string, value: string): Promise<void> {
  const secrets = await getProfileSecrets(profileId);
  secrets[name] = value;
  await saveProfileSecrets(profileId, secrets);
}

/**
 * Delete a secret from a profile
 */
export async function deleteSecretFromProfile(profileId: string, name: string): Promise<void> {
  const secrets = await getProfileSecrets(profileId);
  delete secrets[name];
  await saveProfileSecrets(profileId, secrets);
}

/**
 * Get all secrets as array for UI display
 */
export async function getProfileSecretsArray(profileId: string): Promise<Secret[]> {
  const secrets = await getProfileSecrets(profileId);
  return Object.entries(secrets).map(([name, value]) => ({
    name,
    value,
  }));
}

