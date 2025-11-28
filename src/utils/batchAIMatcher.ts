import { FormField, FormData } from '../types';
import { generateFieldSignature } from './matchingCache';
import { getSettings } from './storage';
import { LAMBDA_API_URL } from '../config/constants';

export interface BatchMatchResult {
  matchedKey?: string;
  confidence: number;
  possibleMatches?: Array<{ key: string; confidence: number; reasoning?: string }>;
}

export interface BatchMatchResponse {
  [fieldIndex: string]: BatchMatchResult;
}

function generateFormSignature(fields: FormField[]): string {
  const fieldSignatures = fields.map(f => generateFieldSignature(f)).sort().join('|');
  let hash = 0;
  for (let i = 0; i < fieldSignatures.length; i++) {
    const char = fieldSignatures.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function generateProfileSignature(profileData: FormData): string {
  const keys = Object.keys(profileData).sort().join('|');
  let hash = 0;
  for (let i = 0; i < keys.length; i++) {
    const char = keys.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export async function batchMatchAllFields(
  fields: FormField[],
  profileData: FormData
): Promise<Map<number, BatchMatchResult>> {
  const results = new Map<number, BatchMatchResult>();
  
  if (fields.length === 0) {
    return results;
  }
  
  const availableKeys = Object.keys(profileData);
  if (availableKeys.length === 0) {
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
  
  const formSignature = generateFormSignature(fields);
  const profileSignature = generateProfileSignature(profileData);
  const batchCacheKey = `batch_mapping:${formSignature}:${profileSignature}`;
  
  console.log(`🤖 [BATCH] Starting batch matching for ${fields.length} fields with ${availableKeys.length} profile keys`);
  console.log(`📋 [BATCH] Fields to match:`);
  fields.forEach((field, idx) => {
    console.log(`  [${idx}] label="${field.label || ''}", name="${field.name || ''}", type="${field.type || ''}"`);
  });
  console.log(`📋 [BATCH] Profile keys available: ${availableKeys.slice(0, 15).join(', ')}${availableKeys.length > 15 ? ` ... (${availableKeys.length} total)` : ''}`);
  
  const startTime = performance.now();
  
  try {
    const cachedResult = await getBatchCachedMatch(batchCacheKey);
    if (cachedResult) {
      const latency = performance.now() - startTime;
      console.log(`✅ [BATCH] Cache hit (latency: ${latency.toFixed(2)}ms)`);
      return cachedResult;
    }
    
    console.log(`❌ [BATCH] Cache miss, calling backend API with ${fields.length} fields...`);
    const batchResult = await callBatchMatchingAPI(fields, availableKeys, settings.openAIKey);
    
    if (batchResult.size > 0) {
      await setBatchCachedMatch(batchCacheKey, batchResult);
      const latency = performance.now() - startTime;
      console.log(`✅ [BATCH] Matched ${batchResult.size}/${fields.length} fields (latency: ${latency.toFixed(2)}ms)`);
    }
    
    return batchResult;
  } catch (error) {
    const latency = performance.now() - startTime;
    console.error(`❌ [BATCH] Batch matching failed (latency: ${latency.toFixed(2)}ms):`, error);
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
      data.mappings.forEach((mapping: any) => {
        const fieldIndex = mapping.fieldIndex;
        if (typeof fieldIndex === 'number' && fieldIndex >= 0 && fieldIndex < fields.length) {
          const matchedKey = mapping.matchedKey;
          const confidence = Math.min(Math.max(mapping.confidence || 0, 0), 100);
          
          if (matchedKey && availableKeys.includes(matchedKey)) {
            const possibleMatches = mapping.possibleMatches || [];
            results.set(fieldIndex, {
              matchedKey,
              confidence,
              possibleMatches: possibleMatches.length > 0 ? possibleMatches : undefined,
            });
          } else if (confidence > 0) {
            results.set(fieldIndex, { confidence });
          } else {
            results.set(fieldIndex, { confidence: 0 });
          }
        }
      });
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

