/**
 * Lambda API Sync - Pull employee/customer data via Lambda API
 */

import { saveFormData, getSettings } from './storage';
import { getAuth } from './googleAuth';
import { SavedFormData } from '../types';
import { LAMBDA_API_URL } from '../config/constants';

export interface DynamoDBConfig {
  apiUrl?: string; // Optional - uses hardcoded URL by default
}

let lastSyncTimestamp = 0;

/**
 * Sync data from Lambda API
 */
export async function syncFromDynamoDB(config: DynamoDBConfig): Promise<number> {
  console.log('☁️ Syncing from Lambda API...');
  
  const auth = await getAuth();
  if (!auth) {
    throw new Error('Not signed in. Please sign in with Google first.');
  }

  console.log('User:', auth.email, 'UserId:', auth.userId);

  try {
    // Call Lambda API (use hardcoded URL)
    const baseUrl = config.apiUrl || LAMBDA_API_URL;
    const apiUrl = `${baseUrl}/api/sync?userId=${encodeURIComponent(auth.userId)}&lastSync=${lastSyncTimestamp}`;
    
    console.log('📡 Calling Lambda API:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const items = data.items || [];

    console.log(`✓ Found ${items.length} new item(s)`);

    let profilesCreated = 0;

    for (const item of items as any[]) {
      console.log('Processing item:', item);
      
      // Create profile from DynamoDB item
      const profile: SavedFormData = {
        id: item.itemId || `dynamo_${Date.now()}_${Math.random()}`,
        name: item.name || `From CRM - ${new Date(item.timestamp).toLocaleString()}`,
        data: item.data || {},
        createdAt: item.timestamp || Date.now(),
        updatedAt: Date.now(),
      };

      await saveFormData(profile);
      profilesCreated++;

      console.log(`✓ Created profile: ${profile.name}`);
    }

    // Update last sync timestamp
    if (items.length > 0) {
      const maxTimestamp = Math.max(...(items as any[]).map((item: any) => item.timestamp || 0));
      lastSyncTimestamp = maxTimestamp;
    }

    console.log(`✅ Sync complete - ${profilesCreated} new profile(s) created`);

    return profilesCreated;
  } catch (error) {
    console.error('❌ DynamoDB sync failed:', error);
    throw error;
  }
}

/**
 * Test Lambda API connection
 */
export async function testDynamoDBConnection(config: DynamoDBConfig): Promise<{ success: boolean; message: string }> {
  try {
    const auth = await getAuth();
    if (!auth) {
      return {
        success: false,
        message: 'Please sign in with Google first',
      };
    }

    // Test health endpoint (use hardcoded URL)
    const baseUrl = config.apiUrl || LAMBDA_API_URL;
    const healthUrl = `${baseUrl}/health`;
    console.log('Testing Lambda API:', healthUrl);

    const response = await fetch(healthUrl);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    return {
      success: true,
      message: `✓ Connected to Lambda API successfully! Service: ${data.service || 'FormBot Lambda'}`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Connection failed: ${error.message || 'Unknown error'}`,
    };
  }
}

/**
 * Push a profile to DynamoDB
 */
export async function pushProfileToDynamoDB(profile: SavedFormData, config: DynamoDBConfig = {}): Promise<void> {
  console.log('☁️ Pushing profile to DynamoDB:', profile.name);
  
  const auth = await getAuth();
  if (!auth) {
    throw new Error('Not signed in. Please sign in with Google first.');
  }

  try {
    const baseUrl = config.apiUrl || LAMBDA_API_URL;
    const apiUrl = `${baseUrl}/api/profiles`;
    
    console.log('📡 Calling Lambda API:', apiUrl);

    // Map profileType to source for DynamoDB
    const sourceMap: Record<string, string> = {
      'google-sheets': 'google-sheets',
      'zapier': 'zapier',
      'crm': 'crm',
      'resume': 'resume',
      'user': 'user',
    };
    
    const source = sourceMap[profile.profileType || 'user'] || 'user';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: auth.userId,
        profileId: profile.id,
        label: profile.name,
        fields: profile.data,
        source: source,
        sourceId: profile.sourceId,
        profileType: profile.profileType,
        isDefault: false,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API returned ${response.status}: ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ Profile pushed successfully:`, data);
  } catch (error) {
    console.error('❌ Failed to push profile to DynamoDB:', error);
    throw error;
  }
}

/**
 * Get ALL profiles from DynamoDB for current user
 * This is the single source of truth for profile data
 */
export async function getAllProfilesFromCloud(config: DynamoDBConfig = {}): Promise<SavedFormData[]> {
  const auth = await getAuth();
  if (!auth) {
    throw new Error('Not signed in. Please sign in with Google first.');
  }

  try {
    const baseUrl = config.apiUrl || LAMBDA_API_URL;
    const apiUrl = `${baseUrl}/api/profiles?userId=${encodeURIComponent(auth.userId)}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const profiles = data.profiles || [];

    // Convert to SavedFormData format
    const savedProfiles: SavedFormData[] = profiles.map((profile: any) => {
      // Parse fields if it's a JSON string
      let fields = profile.fields || {};
      if (typeof fields === 'string') {
        try {
          fields = JSON.parse(fields);
        } catch (e) {
          console.warn('Failed to parse fields JSON:', e);
          fields = {};
        }
      }
      
      return {
        id: profile.profileId,
        profileType: profile.profileType || (profile.source === 'google-sheets' ? 'google-sheets' : profile.source === 'zapier' ? 'zapier' : profile.source === 'crm' ? 'crm' : 'user'),
        sourceId: profile.sourceId,
        name: profile.label || 'Untitled Profile',
        data: fields,
        createdAt: profile.createdAt || Date.now(),
        updatedAt: profile.updatedAt || Date.now(),
      };
    });

    return savedProfiles;
  } catch (error) {
    console.error('❌ Failed to fetch profiles from cloud:', error);
    throw error;
  }
}

/**
 * Push ALL local profiles to DynamoDB
 */
export async function pushAllProfilesToCloud(config: DynamoDBConfig = {}): Promise<{ success: number; failed: number; total: number }> {
  console.log('☁️☁️☁️ Pushing ALL profiles to DynamoDB...');
  
  const auth = await getAuth();
  if (!auth) {
    throw new Error('Not signed in. Please sign in with Google first.');
  }

  // Get profiles from LOCAL cache (not cloud, to avoid circular dependency)
  const result = await chrome.storage.local.get('formbot_data');
  const allProfiles: SavedFormData[] = result['formbot_data'] || [];
  
  if (allProfiles.length === 0) {
    console.log('📭 No profiles to sync');
    return { success: 0, failed: 0, total: 0 };
  }

  console.log(`📊 Found ${allProfiles.length} profile(s) to sync`);

  let successCount = 0;
  let failedCount = 0;

  for (const profile of allProfiles) {
    try {
      await pushProfileToDynamoDB(profile, config);
      successCount++;
      console.log(`✅ [${successCount}/${allProfiles.length}] Synced: ${profile.name}`);
    } catch (error) {
      failedCount++;
      console.error(`❌ [${successCount + failedCount}/${allProfiles.length}] Failed to sync: ${profile.name}`, error);
    }
  }

  console.log(`\n🎉 Sync complete!`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failedCount}`);
  console.log(`   📊 Total: ${allProfiles.length}`);

  return {
    success: successCount,
    failed: failedCount,
    total: allProfiles.length
  };
}

/**
 * Delete a profile from DynamoDB
 */
export async function deleteProfileFromCloud(profileId: string): Promise<void> {
  const auth = await getAuth();
  if (!auth) return;

  try {
    const apiUrl = `${LAMBDA_API_URL}/api/profiles/${profileId}?userId=${encodeURIComponent(auth.userId)}`;
    await fetch(apiUrl, { method: 'DELETE' });
    console.log(`✅ Profile deleted from cloud: ${profileId}`);
  } catch (error) {
    console.warn('Failed to delete profile from cloud:', error);
  }
}

/**
 * Reset sync timestamp (force full resync)
 */
export function resetSyncTimestamp(): void {
  lastSyncTimestamp = 0;
  console.log('🔄 Sync timestamp reset - next sync will fetch all data');
}

