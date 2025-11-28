/**
 * Intelligent field matching using LLM with caching
 */

import { FormField, FormData, FieldType } from '../types';
import { getSettings } from './storage';
import { normalizeString } from './fieldClassifier';
import {
  generateFieldSignature,
  getCachedMatch,
  setLocalCachedMatch,
  storeGlobalMapping,
} from './matchingCache';

export interface IntelligentMatchResult {
  matchedKey?: string;
  confidence: number;
  source: 'cache' | 'ai' | 'fuzzy';
  possibleMatches?: Array<{ key: string; confidence: number; reasoning?: string }>;
}

/**
 * Match a single field intelligently using AI
 */
export async function matchFieldIntelligently(
  field: FormField,
  availableKeys: string[],
  savedData: FormData
): Promise<IntelligentMatchResult> {
  const fieldSignature = generateFieldSignature(field);
  const fieldLabel = field.label || field.name || 'unknown';
  
  console.log(`🔍 [MATCH] Starting intelligent match for: "${fieldLabel}" (signature: ${fieldSignature})`);
  
  // Step 1: Check if AI is enabled (needed for backend AI matching)
  const settings = await getSettings();
  const aiEnabled = settings.openAIEnabled && settings.openAIKey;
  
  // Step 2: Check cache (Redis + Local) with field info for backend AI matching on miss
  const cachedMatch = await getCachedMatch(fieldSignature, aiEnabled ? {
    label: field.label || '',
    name: field.name || '',
    availableKeys: availableKeys,
    openAIKey: settings.openAIKey || '',
    sectionHeader: field.context?.sectionHeader || '',
    nearbyFields: field.context?.nearbyFields || [],
    formPurpose: field.context?.formPurpose || ''
  } : undefined);
  
  if (cachedMatch) {
    console.log(`✅ [MATCH] Cache hit for "${fieldLabel}" → ${cachedMatch.matchedKey} (confidence: ${cachedMatch.confidence})`);
    return {
      matchedKey: cachedMatch.matchedKey,
      confidence: cachedMatch.confidence,
      source: 'cache',
    };
  }
  
  console.log(`❌ [MATCH] Cache miss for "${fieldLabel}", checking if backend handled AI matching...`);
  
  // If backend didn't handle AI matching (no field info sent or AI disabled), try frontend AI
  if (!aiEnabled) {
    console.log(`⏭️ [MATCH] AI disabled for "${fieldLabel}", falling back to fuzzy match`);
    return { confidence: 0, source: 'fuzzy' };
  }
  
  // Backend should have handled AI matching if field info was provided
  // If we still don't have a match, try frontend AI as fallback
  console.log(`🤖 [MATCH] Backend AI didn't find match, trying frontend AI matching...`);
  const aiMatch = await matchFieldWithAI(field, availableKeys, settings.openAIKey);
  if (aiMatch && aiMatch.matchedKey) {
    console.log(`💾 [MATCH] Storing AI match in caches: "${fieldLabel}" → ${aiMatch.matchedKey}`);
    if (aiMatch.possibleMatches && aiMatch.possibleMatches.length > 0) {
      console.log(`   Found ${aiMatch.possibleMatches.length} possible matches for this field`);
    }
    // Store in both caches
    await setLocalCachedMatch(fieldSignature, aiMatch.matchedKey, aiMatch.confidence);
    await storeGlobalMapping(
      fieldSignature,
      aiMatch.matchedKey,
      aiMatch.confidence,
      field.label || '',
      field.name || ''
    );
    
    return {
      matchedKey: aiMatch.matchedKey,
      confidence: aiMatch.confidence,
      source: 'ai',
      possibleMatches: aiMatch.possibleMatches,
    };
  }
  
  console.log(`❌ [MATCH] No AI match found for "${fieldLabel}", falling back to fuzzy match`);
  return { confidence: 0, source: 'fuzzy' };
}

/**
 * Match field using OpenAI API
 */
async function matchFieldWithAI(
  field: FormField,
  availableKeys: string[],
  apiKey: string
): Promise<{ matchedKey: string; confidence: number; possibleMatches?: Array<{ key: string; confidence: number; reasoning?: string }> } | null> {
  if (availableKeys.length === 0) {
    console.log(`⏭️ [LLM] Skipping AI match - no available keys for field: ${field.label || field.name}`);
    return null;
  }
  
  const fieldLabel = field.label || field.name || 'unknown';
  console.log(`🤖 [LLM] Calling OpenAI API for field: "${fieldLabel}" (available keys: ${availableKeys.length})`);
  const startTime = performance.now();
  
  try {
    const prompt = buildSemanticPrompt(field, availableKeys);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a form field matching expert. Match form fields to data keys based on semantic meaning and CONTEXT.

CRITICAL: You MUST return the EXACT key name(s) from the available keys list. Do not modify, normalize, or change the key names.

CONTEXT IS KEY: Use section headers, nearby fields, and form purpose to disambiguate ambiguous fields.

Examples of context-aware matching:
- Field "Name" in "Pet Information" section with nearby fields ["Breed", "Age"] → petName (NOT fullName or firstName)
- Field "Name" in "Personal Information" section with nearby fields ["Email", "Phone"] → fullName or firstName
- Field "Address" in "Billing Information" section → billingAddress (NOT address)
- Field "Contact" in "Emergency Contact" section → emergencyContact (NOT email or phone)

A form field can potentially match MULTIPLE profile keys. Return the BEST match as matchedKey, and list ALL possible matches in possibleMatches array.

If no good match exists, return null for matchedKey and empty array for possibleMatches.

Respond ONLY with valid JSON: {"matchedKey": "exact_key_from_list" or null, "confidence": 0-100, "possibleMatches": [{"key": "exact_key", "confidence": 0-100}, ...]}`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 150,
        response_format: { type: 'json_object' },
      }),
    });
    
    if (!response.ok) {
      console.error('OpenAI API error:', response.statusText);
      return null;
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    const latency = performance.now() - startTime;
    
    if (!content) {
      console.warn(`⚠️ [LLM] OpenAI API returned empty content (latency: ${latency.toFixed(2)}ms)`);
      return null;
    }
    
    const result = JSON.parse(content);
    
    const possibleMatches: Array<{ key: string; confidence: number; reasoning?: string }> = [];
    
    if (result.possibleMatches && Array.isArray(result.possibleMatches)) {
      for (const match of result.possibleMatches) {
        if (match.key && availableKeys.includes(match.key)) {
          possibleMatches.push({
            key: match.key,
            confidence: Math.min(Math.max(match.confidence || 70, 0), 95),
            reasoning: match.reasoning
          });
        } else if (match.key) {
          const normalizedMatched = normalizeString(match.key);
          const normalizedAvailable = availableKeys.map(k => ({ original: k, normalized: normalizeString(k) }));
          const fuzzyMatch = normalizedAvailable.find(({ normalized }) => normalized === normalizedMatched);
          if (fuzzyMatch) {
            possibleMatches.push({
              key: fuzzyMatch.original,
              confidence: Math.min(Math.max(match.confidence || 70, 0), 95),
              reasoning: match.reasoning
            });
          }
        }
      }
    }
    
    if (result.matchedKey) {
      const matchedKey = result.matchedKey;
      let bestMatch: { matchedKey: string; confidence: number } | null = null;
      
      if (availableKeys.includes(matchedKey)) {
        const confidence = Math.min(Math.max(result.confidence || 80, 0), 95);
        bestMatch = { matchedKey, confidence };
      } else {
        const normalizedMatched = normalizeString(matchedKey);
        const normalizedAvailable = availableKeys.map(k => ({ original: k, normalized: normalizeString(k) }));
        const fuzzyMatch = normalizedAvailable.find(({ normalized }) => normalized === normalizedMatched);
        if (fuzzyMatch) {
          const confidence = Math.min(Math.max(result.confidence || 80, 0), 95);
          bestMatch = { matchedKey: fuzzyMatch.original, confidence };
        }
      }
      
      if (bestMatch) {
        console.log(`✅ [LLM] AI match found: "${fieldLabel}" → ${bestMatch.matchedKey} (confidence: ${bestMatch.confidence}, ${possibleMatches.length} possible matches, latency: ${latency.toFixed(2)}ms)`);
        if (possibleMatches.length > 0) {
          console.log(`   Possible matches: ${possibleMatches.map(m => `${m.key} (${m.confidence}%)`).join(', ')}`);
        }
        return {
          matchedKey: bestMatch.matchedKey,
          confidence: bestMatch.confidence,
          possibleMatches: possibleMatches.length > 0 ? possibleMatches : undefined
        };
      }
      
      console.log(`❌ [LLM] AI returned key "${matchedKey}" but it's not in available keys (latency: ${latency.toFixed(2)}ms)`);
      console.log(`   Available keys (first 10): ${availableKeys.slice(0, 10).join(', ')}`);
    }
    
    if (possibleMatches.length > 0) {
      const bestPossible = possibleMatches[0];
      console.log(`✅ [LLM] Using best possible match: "${fieldLabel}" → ${bestPossible.key} (confidence: ${bestPossible.confidence}, ${possibleMatches.length} total matches, latency: ${latency.toFixed(2)}ms)`);
      return {
        matchedKey: bestPossible.key,
        confidence: bestPossible.confidence,
        possibleMatches: possibleMatches.length > 1 ? possibleMatches : undefined
      };
    }
    
    console.log(`❌ [LLM] No valid match found for "${fieldLabel}" (latency: ${latency.toFixed(2)}ms)`);
    return null;
  } catch (error) {
    const latency = performance.now() - startTime;
    console.error(`❌ [LLM] AI matching failed (latency: ${latency.toFixed(2)}ms):`, error);
    return null;
  }
}

/**
 * Build semantic prompt for OpenAI
 */
function buildSemanticPrompt(field: FormField, availableKeys: string[]): string {
  const fieldInfo = [
    field.label ? `Label: "${field.label}"` : null,
    field.name ? `Name: "${field.name}"` : null,
    field.placeholder ? `Placeholder: "${field.placeholder}"` : null,
    field.ariaLabel ? `Aria-label: "${field.ariaLabel}"` : null,
  ].filter(Boolean).join('\n');
  
  const contextInfo: string[] = [];
  
  if (field.context?.sectionHeader) {
    contextInfo.push(`Section: "${field.context.sectionHeader}"`);
  }
  
  if (field.context?.nearbyFields && field.context.nearbyFields.length > 0) {
    const nearbyLabels = field.context.nearbyFields.map(f => f.label).filter(l => l.length > 0);
    if (nearbyLabels.length > 0) {
      contextInfo.push(`Nearby fields: ${nearbyLabels.join(', ')}`);
    }
  }
  
  if (field.context?.formPurpose) {
    contextInfo.push(`Form purpose: ${field.context.formPurpose}`);
  }
  
  const contextSection = contextInfo.length > 0 
    ? `\n\nCONTEXT (use this to disambiguate the field):\n${contextInfo.join('\n')}`
    : '';
  
  return `Form field to match:
${fieldInfo}${contextSection}

Available data keys (you MUST return keys EXACTLY as written):
${availableKeys.map((k, i) => `${i + 1}. "${k}"`).join('\n')}

Analyze which data keys semantically match this field. Use the CONTEXT to disambiguate ambiguous fields.

IMPORTANT CONTEXT RULES:
- If section is "Pet Information" and nearby fields include "Breed" or "Age", "Name" likely means petName
- If section is "Personal Information" and nearby fields include "Email" or "Phone", "Name" likely means fullName or firstName
- If form purpose is "Pet Registration", fields in pet-related sections should match pet-related profile keys
- Use nearby fields to understand field grouping and purpose

Return:
1. matchedKey: The BEST single match based on field label AND context (or null if no match)
2. possibleMatches: Array of ALL possible matches with confidence scores

Examples with context:
- Field "Name" in "Pet Information" section with nearby ["Breed", "Age"] → petName (NOT fullName)
- Field "Name" in "Personal Information" section with nearby ["Email"] → fullName or firstName
- Field "Contact" in "Emergency Contact" section → emergencyContact (NOT email)

For each possible match, consider:
- Semantic similarity (how well the meaning matches)
- Context clues (section, nearby fields, form purpose)
- Common usage patterns
- Field type compatibility

IMPORTANT: 
- Return keys EXACTLY as they appear in the list above
- Include ALL reasonable matches in possibleMatches (confidence > 50)
- Order possibleMatches by confidence (highest first)
- If no good match exists, return null for matchedKey and empty array for possibleMatches`;
}

/**
 * Batch match multiple fields intelligently
 */
export async function batchMatchFieldsIntelligently(
  fields: FormField[],
  availableKeys: string[],
  savedData: FormData
): Promise<Map<number, IntelligentMatchResult>> {
  const results = new Map<number, IntelligentMatchResult>();
  
  // Step 1: Check cache for all fields in parallel
  const cacheChecks = fields.map(async (field, index) => {
    const fieldSignature = generateFieldSignature(field);
    const cachedMatch = await getCachedMatch(fieldSignature);
    
    if (cachedMatch) {
      results.set(index, {
        matchedKey: cachedMatch.matchedKey,
        confidence: cachedMatch.confidence,
        source: 'cache',
      });
      return { index, cached: true };
    }
    
    return { index, cached: false };
  });
  
  await Promise.all(cacheChecks);
  
  // Step 2: Collect fields that need AI matching
  const fieldsNeedingAI = fields
    .map((field, index) => ({ field, index }))
    .filter(({ index }) => !results.has(index));
  
  if (fieldsNeedingAI.length === 0) {
    return results;
  }
  
  // Step 3: Check if AI is enabled
  const settings = await getSettings();
  if (!settings.openAIEnabled || !settings.openAIKey) {
    // Mark all as needing fuzzy match
    fieldsNeedingAI.forEach(({ index }) => {
      results.set(index, { confidence: 0, source: 'fuzzy' });
    });
    return results;
  }
  
  // Step 4: Batch AI matching (up to 10 fields per batch)
  const batchSize = 10;
  for (let i = 0; i < fieldsNeedingAI.length; i += batchSize) {
    const batch = fieldsNeedingAI.slice(i, i + batchSize);
    const batchResults = await batchMatchWithAI(batch.map(b => b.field), availableKeys, settings.openAIKey);
    
    batch.forEach(({ field, index }, batchIndex) => {
      const match = batchResults.get(batchIndex);
      if (match && match.matchedKey) {
        const fieldSignature = generateFieldSignature(field);
        
        // Store in caches
        setLocalCachedMatch(fieldSignature, match.matchedKey, match.confidence);
        storeGlobalMapping(
          fieldSignature,
          match.matchedKey,
          match.confidence,
          field.label || '',
          field.name || ''
        );
        
        results.set(index, {
          matchedKey: match.matchedKey,
          confidence: match.confidence,
          source: 'ai',
        });
      } else {
        results.set(index, { confidence: 0, source: 'fuzzy' });
      }
    });
  }
  
  return results;
}

/**
 * Batch match fields using OpenAI API
 */
async function batchMatchWithAI(
  fields: FormField[],
  availableKeys: string[],
  apiKey: string
): Promise<Map<number, { matchedKey: string; confidence: number }>> {
  const results = new Map<number, { matchedKey: string; confidence: number }>();
  
  if (availableKeys.length === 0 || fields.length === 0) {
    console.log(`⏭️ [LLM] Skipping batch AI match - ${fields.length} fields, ${availableKeys.length} keys`);
    return results;
  }
  
  const fieldLabels = fields.map(f => f.label || f.name || 'unknown').join(', ');
  console.log(`🤖 [LLM] Batch calling OpenAI API for ${fields.length} fields: [${fieldLabels}] (${availableKeys.length} available keys)`);
  const startTime = performance.now();
  
  try {
    const prompt = buildBatchPrompt(fields, availableKeys);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a form field matching expert. Match form fields to data keys based on semantic meaning.

Match fields semantically:
- "personal projects" → "projects"
- "work experience" → "experience"
- "email address" → "email"

Respond ONLY with valid JSON object.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });
    
    if (!response.ok) {
      console.error('OpenAI batch API error:', response.statusText);
      return results;
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      return results;
    }
    
    const parsed = JSON.parse(content);
    const mappings = parsed.mappings || [];
    const latency = performance.now() - startTime;
    
    let matchCount = 0;
    mappings.forEach((mapping: any) => {
      const fieldIndex = mapping.fieldIndex;
      if (
        typeof fieldIndex === 'number' &&
        fieldIndex >= 0 &&
        fieldIndex < fields.length &&
        mapping.matchedKey &&
        availableKeys.includes(mapping.matchedKey)
      ) {
        const field = fields[fieldIndex];
        const fieldLabel = field.label || field.name || `field${fieldIndex}`;
        const confidence = Math.min(Math.max(mapping.confidence || 80, 0), 95);
        results.set(fieldIndex, {
          matchedKey: mapping.matchedKey,
          confidence: confidence,
        });
        matchCount++;
        console.log(`  ✓ [LLM] Field ${fieldIndex} ("${fieldLabel}") → ${mapping.matchedKey} (confidence: ${confidence})`);
      }
    });
    
    console.log(`✅ [LLM] Batch AI match complete: ${matchCount}/${fields.length} fields matched (latency: ${latency.toFixed(2)}ms)`);
    return results;
  } catch (error) {
    const latency = performance.now() - startTime;
    console.error(`❌ [LLM] Batch AI matching failed (latency: ${latency.toFixed(2)}ms):`, error);
    return results;
  }
}

/**
 * Build batch prompt for multiple fields
 */
function buildBatchPrompt(fields: FormField[], availableKeys: string[]): string {
  const fieldsInfo = fields.map((field, index) => {
    const parts = [
      `Field ${index}:`,
      field.label ? `  Label: "${field.label}"` : null,
      field.name ? `  Name: "${field.name}"` : null,
      field.placeholder ? `  Placeholder: "${field.placeholder}"` : null,
    ].filter(Boolean).join('\n');
    return parts;
  }).join('\n\n');
  
  return `Match these form fields to available data keys:

${fieldsInfo}

Available data keys:
${availableKeys.map(k => `- ${k}`).join('\n')}

Return JSON:
{
  "mappings": [
    {
      "fieldIndex": 0,
      "matchedKey": "key_name" or null,
      "confidence": 0-100
    }
  ]
}

Match semantically - consider meaning, not just exact words.`;
}

