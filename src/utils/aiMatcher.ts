/**
 * OpenAI integration for field matching enhancement
 */

import { AIMatchRequest, AIMatchResponse, FieldType } from '../types';
import { getSettings } from './storage';

/**
 * Use OpenAI to match a field to saved data keys
 */
export async function matchFieldWithAI(request: AIMatchRequest): Promise<AIMatchResponse | null> {
  const settings = await getSettings();
  
  if (!settings.openAIEnabled || !settings.openAIKey) {
    return null;
  }
  
  try {
    const prompt = buildPrompt(request);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.openAIKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a form field matching expert. Given a form field description and available data keys, determine the best match. Respond only with JSON in the format: {"matchedKey": "key", "confidence": 85}',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 100,
      }),
    });
    
    if (!response.ok) {
      console.error('OpenAI API error:', response.statusText);
      return null;
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      return null;
    }
    
    // Parse JSON response
    const result = JSON.parse(content);
    
    if (result.matchedKey && result.confidence) {
      return {
        matchedKey: result.matchedKey,
        confidence: Math.min(result.confidence, 95), // Cap AI confidence at 95%
      };
    }
    
    return null;
  } catch (error) {
    console.error('AI matching failed:', error);
    return null;
  }
}

/**
 * Build prompt for OpenAI
 */
function buildPrompt(request: AIMatchRequest): string {
  return `
Form field to match:
- Field name: ${request.fieldName}
- Field type: ${request.fieldType}
- Placeholder: ${request.placeholder}
- Label: ${request.label}

Available data keys to match against:
${request.availableKeys.map(k => `- ${k}`).join('\n')}

Which key best matches this field? Provide confidence (0-100).
`.trim();
}

/**
 * Batch match multiple fields with AI
 */
export async function batchMatchFieldsWithAI(requests: AIMatchRequest[]): Promise<Map<string, AIMatchResponse>> {
  const settings = await getSettings();
  
  if (!settings.openAIEnabled || !settings.openAIKey) {
    return new Map();
  }
  
  const results = new Map<string, AIMatchResponse>();
  
  // Process in parallel with rate limiting
  const batchSize = 5;
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    const promises = batch.map(req => matchFieldWithAI(req));
    const batchResults = await Promise.all(promises);
    
    batch.forEach((req, index) => {
      const result = batchResults[index];
      if (result) {
        results.set(req.fieldName, result);
      }
    });
    
    // Small delay between batches to respect rate limits
    if (i + batchSize < requests.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
}

