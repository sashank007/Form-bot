/**
 * Matching cache layer - Local (Chrome storage) + Global (Redis via Lambda)
 */

import { FormField } from '../types';
import { normalizeString } from './fieldClassifier';
import { LAMBDA_API_URL } from '../config/constants';

const STORAGE_KEY = 'formbot_matching_cache';
const MAX_CACHE_SIZE = 1000;
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface MatchingCacheEntry {
  matchedKey: string;
  confidence: number;
  timestamp: number;
  fieldSignature: string;
}

export interface MatchingCache {
  [fieldSignature: string]: MatchingCacheEntry;
}

export interface GlobalCacheResponse {
  matchedKey: string;
  confidence: number;
  usageCount?: number;
}

/**
 * Generate field signature (hash of normalized field attributes)
 */
export function generateFieldSignature(field: FormField): string {
  const normalized = normalizeString(
    `${field.label}|${field.name}|${field.placeholder}|${field.id}|${field.ariaLabel}`
  );
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Get cached match from local cache
 */
export async function getLocalCachedMatch(fieldSignature: string): Promise<MatchingCacheEntry | null> {
  const startTime = performance.now();
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const cache: MatchingCache = result[STORAGE_KEY] || {};
    
    const entry = cache[fieldSignature];
    const latency = performance.now() - startTime;
    
    if (!entry) {
      console.log(`❌ [CACHE] Local cache MISS for ${fieldSignature} (latency: ${latency.toFixed(2)}ms)`);
      return null;
    }
    
    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > CACHE_TTL) {
      // Remove expired entry
      delete cache[fieldSignature];
      await chrome.storage.local.set({ [STORAGE_KEY]: cache });
      console.log(`⏰ [CACHE] Local cache entry expired for ${fieldSignature}`);
      return null;
    }
    
    console.log(`✅ [CACHE] Local cache HIT for ${fieldSignature} → ${entry.matchedKey} (confidence: ${entry.confidence}, latency: ${latency.toFixed(2)}ms)`);
    return entry;
  } catch (error) {
    const latency = performance.now() - startTime;
    console.error(`❌ [CACHE] Failed to get local cache (latency: ${latency.toFixed(2)}ms):`, error);
    return null;
  }
}

/**
 * Set cached match in local cache
 */
export async function setLocalCachedMatch(
  fieldSignature: string,
  matchedKey: string,
  confidence: number
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const cache: MatchingCache = result[STORAGE_KEY] || {};
    
    // Enforce cache size limit (LRU eviction)
    const entries = Object.entries(cache);
    if (entries.length >= MAX_CACHE_SIZE) {
      // Remove oldest entry
      const sorted = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      delete cache[sorted[0][0]];
    }
    
    cache[fieldSignature] = {
      matchedKey,
      confidence,
      timestamp: Date.now(),
      fieldSignature,
    };
    
    await chrome.storage.local.set({ [STORAGE_KEY]: cache });
  } catch (error) {
    console.error('Failed to set local cache:', error);
  }
}

/**
 * Check global Redis cache via Lambda API
 * Optionally provides field info for AI matching on cache miss
 */
export async function getGlobalCachedMatch(
  fieldSignature: string,
  fieldInfo?: { label?: string; name?: string; availableKeys?: string[]; openAIKey?: string; sectionHeader?: string; nearbyFields?: Array<{ label: string; name: string }>; formPurpose?: string }
): Promise<GlobalCacheResponse | null> {
  const apiUrl = `${LAMBDA_API_URL}/api/field-mapping`;
  console.log(`📡 [API] POST ${apiUrl} - Getting mapping for: ${fieldSignature}`);
  
  const startTime = performance.now();
  try {
    const requestBody: any = {
      action: 'get',
      fieldSignature: fieldSignature,
    };
    
    // Include field info for AI matching on cache miss
    if (fieldInfo) {
      requestBody.fieldLabel = fieldInfo.label || '';
      requestBody.fieldName = fieldInfo.name || '';
      requestBody.availableKeys = fieldInfo.availableKeys || [];
      requestBody.openAIKey = fieldInfo.openAIKey || '';
      requestBody.sectionHeader = fieldInfo.sectionHeader || '';
      requestBody.nearbyFields = fieldInfo.nearbyFields || [];
      requestBody.formPurpose = fieldInfo.formPurpose || '';
    }
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    const latency = performance.now() - startTime;
    
    if (response.status === 404) {
      console.log(`❌ [REDIS] Global cache MISS for ${fieldSignature} (API latency: ${latency.toFixed(2)}ms)`);
      return null; // Not found in cache
    }
    
    if (!response.ok) {
      console.warn(`⚠️ [API] Global cache lookup failed: ${response.status} (latency: ${latency.toFixed(2)}ms)`);
      return null;
    }
    
    const data = await response.json();
    const source = data.source || 'cache';
    console.log(`✅ [REDIS] Global cache ${source === 'ai' ? 'AI MATCH' : 'HIT'} for ${fieldSignature} → ${data.matchedKey} (confidence: ${data.confidence}, usageCount: ${data.usageCount || 0}, API latency: ${latency.toFixed(2)}ms)`);
    
    return {
      matchedKey: data.matchedKey,
      confidence: data.confidence,
      usageCount: data.usageCount,
    };
  } catch (error) {
    const latency = performance.now() - startTime;
    console.warn(`⚠️ [API] Global cache lookup error (falling back, latency: ${latency.toFixed(2)}ms):`, error);
    return null; // Graceful fallback
  }
}

/**
 * Store mapping in global Redis cache via Lambda API
 */
export async function storeGlobalMapping(
  fieldSignature: string,
  matchedKey: string,
  confidence: number,
  fieldLabel: string,
  fieldName: string
): Promise<void> {
  // Only store high-confidence matches in global cache
  if (confidence < 80) {
    console.log(`⏭️ [REDIS] Skipping global cache store for ${fieldSignature} (low confidence: ${confidence})`);
    return;
  }
  
  const apiUrl = `${LAMBDA_API_URL}/api/field-mapping`;
  const payload = {
    action: 'store',
    fieldSignature,
    matchedKey,
    confidence,
    fieldLabel,
    fieldName,
  };
  
  console.log(`💾 [API] POST ${apiUrl} - Storing mapping: ${fieldSignature} → ${matchedKey} (confidence: ${confidence})`);
  const startTime = performance.now();
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    const latency = performance.now() - startTime;
    
    if (response.ok) {
      console.log(`✅ [REDIS] Stored in global cache: ${fieldSignature} → ${matchedKey} (API latency: ${latency.toFixed(2)}ms)`);
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.warn(`⚠️ [API] Failed to store in global cache (${response.status}, latency: ${latency.toFixed(2)}ms):`, errorData);
    }
    
    // Don't wait for response - fire and forget
  } catch (error) {
    const latency = performance.now() - startTime;
    console.warn(`⚠️ [API] Global cache store error (latency: ${latency.toFixed(2)}ms):`, error);
  }
}

/**
 * Get cached match (checks local first, then global)
 * Optionally provides field info for AI matching on cache miss
 */
export async function getCachedMatch(
  fieldSignature: string,
  fieldInfo?: { label?: string; name?: string; availableKeys?: string[]; openAIKey?: string; sectionHeader?: string; nearbyFields?: Array<{ label: string; name: string }>; formPurpose?: string }
): Promise<{ matchedKey: string; confidence: number } | null> {
  // Check local cache first (fastest)
  const localMatch = await getLocalCachedMatch(fieldSignature);
  if (localMatch) {
    return {
      matchedKey: localMatch.matchedKey,
      confidence: localMatch.confidence,
    };
  }
  
  // Check global cache (with field info for AI matching on miss)
  const globalMatch = await getGlobalCachedMatch(fieldSignature, fieldInfo);
  if (globalMatch) {
    // Store in local cache for faster future access
    await setLocalCachedMatch(fieldSignature, globalMatch.matchedKey, globalMatch.confidence);
    return {
      matchedKey: globalMatch.matchedKey,
      confidence: globalMatch.confidence,
    };
  }
  
  return null;
}

/**
 * Invalidate local cache entries matching a key
 */
export async function invalidateCacheForKey(matchedKey: string): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const cache: MatchingCache = result[STORAGE_KEY] || {};
    
    let removed = 0;
    for (const signature in cache) {
      if (cache[signature].matchedKey === matchedKey) {
        delete cache[signature];
        removed++;
      }
    }
    
    if (removed > 0) {
      await chrome.storage.local.set({ [STORAGE_KEY]: cache });
      console.log(`Invalidated ${removed} cache entries for key: ${matchedKey}`);
    }
  } catch (error) {
    console.error('Failed to invalidate cache:', error);
  }
}

/**
 * Clear all local cache
 */
export async function clearLocalCache(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  localEntries: number;
  localHits: number;
  globalHits: number;
}> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const cache: MatchingCache = result[STORAGE_KEY] || {};
    
    return {
      localEntries: Object.keys(cache).length,
      localHits: 0, // Would need to track this separately
      globalHits: 0, // Would need to track this separately
    };
  } catch (error) {
    return {
      localEntries: 0,
      localHits: 0,
      globalHits: 0,
    };
  }
}

