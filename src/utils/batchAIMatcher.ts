import { FormField, FormData } from '../types';
import { generateFieldSignature } from './matchingCache';
import { getSettings } from './storage';
import { LAMBDA_API_URL } from '../config/constants';

export interface BatchMatchResult {
  matchedKey?: string;
  confidence: number;
  reasoning?: string;  // AI explanation for why this match was made
  matchFactors?: string[];  // What factors contributed: field name, input type, nearby text, etc.
  possibleMatches?: Array<{ key: string; confidence: number; reasoning?: string }>;
}

export interface BatchMatchResponse {
  [fieldIndex: string]: BatchMatchResult;
}

function generateFormSignature(fields: FormField[], url?: string): string {
  // Include normalized URL in signature for site-specific caching
  const normalizedUrl = url ? new URL(url).pathname.replace(/\/$/, '') : '';
  const fieldSignatures = fields.map(f => generateFieldSignature(f)).sort().join('|');
  const combined = `${normalizedUrl}:${fieldSignatures}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function generateFormUUID(fields: FormField[], url?: string): string {
  const formSig = generateFormSignature(fields, url);
  const timestamp = Math.floor(Date.now() / (1000 * 60 * 60 * 24)); // Day-based
  return `form_${formSig}_${timestamp.toString(36)}`;
}

function generateProfileSignature(availableKeys: string[]): string {
  const keys = availableKeys.sort().join('|');
  let hash = 0;
  for (let i = 0; i < keys.length; i++) {
    const char = keys.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function flattenProfileData(data: FormData): FormData {
  if (data.rows && Array.isArray(data.rows) && data.rows.length > 0) {
    const flattened: FormData = {};
    for (const row of data.rows) {
      if (typeof row === 'object' && row !== null) {
        Object.assign(flattened, row);
      }
    }
    for (const key in data) {
      if (key !== 'rows' && !(key in flattened)) {
        flattened[key] = data[key];
      }
    }
    return flattened;
  }
  return data;
}

export async function batchMatchAllFields(
  fields: FormField[],
  profileData: FormData,
  pageUrl?: string
): Promise<Map<number, BatchMatchResult>> {
  const results = new Map<number, BatchMatchResult>();
  
  if (fields.length === 0) {
    return results;
  }
  
  const flattenedData = flattenProfileData(profileData);
  const availableKeys = Object.keys(flattenedData).filter(key => {
    const value = flattenedData[key];
    return value && typeof value === 'string' && value.trim() !== '';
  });
  
  console.log(`📋 [BATCH] Profile data keys after flattening: ${availableKeys.length}`);
  
  if (availableKeys.length === 0) {
    console.log('⚠️ [BATCH] No profile data keys available - profile may be empty');
    fields.forEach((_, index) => {
      results.set(index, { confidence: 0 });
    });
    return results;
  }
  
  const settings = await getSettings();
  if (!settings.openAIEnabled || !settings.openAIKey) {
    console.log('⏭️ [BATCH] AI disabled, skipping batch matching');
    fields.forEach((_, index) => {
      results.set(index, { confidence: 0 });
    });
    return results;
  }
  
  // Generate cache key based on: URL + form structure + profile keys
  const currentUrl = pageUrl || (typeof window !== 'undefined' ? window.location.href : '');
  const formSignature = generateFormSignature(fields, currentUrl);
  const profileSignature = generateProfileSignature(availableKeys);
  const formUUID = generateFormUUID(fields, currentUrl);
  const batchCacheKey = `batch_mapping:${formUUID}:${profileSignature}`;
  
  console.log(`🔑 [BATCH] Form UUID: ${formUUID}`);
  console.log(`🔑 [BATCH] Cache key: ${batchCacheKey}`);
  console.log(`🤖 [BATCH] Matching ${fields.length} fields with ${availableKeys.length} profile keys`);
  
  const startTime = performance.now();
  
  try {
    // Check cache first - saves API calls for repeat visits
    const cachedResult = await getBatchCachedMatch(batchCacheKey);
    if (cachedResult && cachedResult.size > 0) {
      const latency = performance.now() - startTime;
      console.log(`✅ [BATCH] 🎯 CACHE HIT! Loaded ${cachedResult.size} mappings (${latency.toFixed(0)}ms)`);
      return cachedResult;
    }
    
    console.log(`📡 [BATCH] Cache miss - calling AI API...`);
    const batchResult = await callBatchMatchingAPI(fields, availableKeys, settings.openAIKey);
    
    if (batchResult.size > 0) {
      // Save to cache for future visits
      await setBatchCachedMatch(batchCacheKey, batchResult);
      const latency = performance.now() - startTime;
      console.log(`✅ [BATCH] Matched ${batchResult.size}/${fields.length} fields, cached for future (${latency.toFixed(0)}ms)`);
    }
    
    return batchResult;
  } catch (error) {
    const latency = performance.now() - startTime;
    console.error(`❌ [BATCH] Batch matching failed (${latency.toFixed(0)}ms):`, error);
    fields.forEach((_, index) => {
      results.set(index, { confidence: 0 });
    });
    return results;
  }
}

async function callBatchMatchingAPI(
  fields: FormField[],
  availableKeys: string[],
  openAIKey: string
): Promise<Map<number, BatchMatchResult>> {
  const results = new Map<number, BatchMatchResult>();
  
  const apiUrl = `${LAMBDA_API_URL}/api/batch-field-mapping`;
  
  const fieldsData = fields.map((field, index) => ({
    index,
    label: field.label || '',
    name: field.name || '',
    placeholder: field.placeholder || '',
    ariaLabel: field.ariaLabel || '',
    type: field.type || '',
    sectionHeader: field.context?.sectionHeader || '',
    nearbyFields: field.context?.nearbyFields || [],
    formPurpose: field.context?.formPurpose || '',
  }));
  
  console.log(`📤 [BATCH] Preparing to send ${fieldsData.length} fields to batch API:`);
  fieldsData.forEach((fieldData, idx) => {
    console.log(`  Field ${idx}: label="${fieldData.label}", name="${fieldData.name}", type="${fieldData.type}", section="${fieldData.sectionHeader}"`);
  });
  console.log(`📤 [BATCH] Available profile keys (${availableKeys.length}):`, availableKeys.slice(0, 10).join(', '), availableKeys.length > 10 ? '...' : '');
  
  const requestBody = {
    fields: fieldsData,
    availableKeys,
    openAIKey,
  };
  
  console.log(`🔑 [BATCH] Sending ${availableKeys.length} profile keys to API:`, availableKeys);
  console.log(`📝 [BATCH] Full request body (without API key):`, { fields: fieldsData, availableKeys, openAIKey: '***' });
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [BATCH] API error ${response.status}:`, errorText);
      return results;
    }
    
    const data = await response.json();
    
    if (data.mappings && Array.isArray(data.mappings)) {
      console.log(`📥 [BATCH] Received ${data.mappings.length} mappings from API`);
      
      data.mappings.forEach((mapping: any) => {
        const fieldIndex = mapping.fieldIndex;
        if (typeof fieldIndex === 'number' && fieldIndex >= 0 && fieldIndex < fields.length) {
          const matchedKey = mapping.matchedKey;
          const confidence = Math.min(Math.max(mapping.confidence || 0, 0), 100);
          const reasoning = mapping.reasoning || '';
          const matchFactors = mapping.matchFactors || [];
          
          console.log(`📥 [BATCH] Field ${fieldIndex}: matchedKey="${matchedKey}", confidence=${confidence}, reasoning="${reasoning}"`);
          
          if (matchedKey && availableKeys.includes(matchedKey)) {
            const possibleMatches = mapping.possibleMatches || [];
            results.set(fieldIndex, {
              matchedKey,
              confidence,
              reasoning,
              matchFactors,
              possibleMatches: possibleMatches.length > 0 ? possibleMatches : undefined,
            });
          } else if (matchedKey) {
            console.log(`⚠️ [BATCH] Field ${fieldIndex}: Key "${matchedKey}" NOT in available keys!`);
            results.set(fieldIndex, { confidence: 0 });
          } else {
            results.set(fieldIndex, { confidence: 0 });
          }
        }
      });
    } else {
      console.log('⚠️ [BATCH] No mappings in API response:', data);
    }
    
    // Ensure all fields have a result (even if no match)
    for (let i = 0; i < fields.length; i++) {
      if (!results.has(i)) {
        results.set(i, { confidence: 0 });
      }
    }
    
    return results;
  } catch (error) {
    console.error('❌ [BATCH] Network error:', error);
    return results;
  }
}

async function getBatchCachedMatch(
  cacheKey: string
): Promise<Map<number, BatchMatchResult> | null> {
  try {
    const result = await chrome.storage.local.get(cacheKey);
    const cached = result[cacheKey];
    
    if (!cached) {
      return null;
    }
    
    const now = Date.now();
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
    
    if (now - cached.timestamp > CACHE_TTL) {
      await chrome.storage.local.remove(cacheKey);
      return null;
    }
    
    const results = new Map<number, BatchMatchResult>();
    if (cached.mappings) {
      Object.entries(cached.mappings).forEach(([index, mapping]: [string, any]) => {
        results.set(parseInt(index), {
          matchedKey: mapping.matchedKey,
          confidence: mapping.confidence,
          possibleMatches: mapping.possibleMatches,
        });
      });
    }
    
    return results;
  } catch (error) {
    console.error('Failed to get batch cache:', error);
    return null;
  }
}

async function setBatchCachedMatch(
  cacheKey: string,
  results: Map<number, BatchMatchResult>
): Promise<void> {
  try {
    const mappings: { [key: number]: BatchMatchResult } = {};
    results.forEach((result, index) => {
      mappings[index] = result;
    });
    
    await chrome.storage.local.set({
      [cacheKey]: {
        mappings,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error('Failed to set batch cache:', error);
  }
}

export async function invalidateBatchCache(): Promise<void> {
  try {
    const allData = await chrome.storage.local.get(null);
    const batchKeys = Object.keys(allData).filter(key => key.startsWith('batch_mapping:'));
    
    if (batchKeys.length > 0) {
      await chrome.storage.local.remove(batchKeys);
      console.log(`🗑️ [BATCH] Invalidated ${batchKeys.length} batch cache entries`);
    }
  } catch (error) {
    console.error('Failed to invalidate batch cache:', error);
  }
}

