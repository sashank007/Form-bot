/**
 * AI-Powered Form Analysis (Hybrid Approach)
 * Uses OpenAI to intelligently match uncertain fields
 */

import { DetectedField, FormData } from '../types';
import { getSettings } from './storage';

interface AIAnalysisRequest {
  fields: Array<{
    index: number;
    label: string;
    placeholder: string;
    name: string;
    type: string;
    ariaLabel: string;
    contextText?: string;
  }>;
  availableData: string[];
}

interface AIFieldMapping {
  fieldIndex: number;
  matchedKey: string;
  confidence: number;
  reasoning: string;
}

/**
 * Analyze uncertain fields using AI
 */
export async function analyzeFieldsWithAI(
  uncertainFields: DetectedField[],
  savedData: FormData
): Promise<Map<number, { matchedKey: string; confidence: number }>> {
  const settings = await getSettings();
  
  if (!settings.openAIEnabled || !settings.openAIKey) {
    console.log('Form Bot: AI not enabled, skipping analysis');
    return new Map();
  }

  if (uncertainFields.length === 0) {
    return new Map();
  }

  try {
    // Prepare request
    const request: AIAnalysisRequest = {
      fields: uncertainFields.map((df, idx) => ({
        index: idx,
        label: df.field.label || '',
        placeholder: df.field.placeholder || '',
        name: df.field.name || '',
        type: df.field.type || '',
        ariaLabel: df.field.ariaLabel || '',
        contextText: extractContextText(df.field.element as HTMLElement),
      })),
      availableData: Object.keys(savedData),
    };

    const mappings = await callOpenAI(request, settings.openAIKey);
    
    // Convert to map
    const resultMap = new Map<number, { matchedKey: string; confidence: number }>();
    mappings.forEach(mapping => {
      if (mapping.matchedKey && mapping.confidence > 60) {
        resultMap.set(mapping.fieldIndex, {
          matchedKey: mapping.matchedKey,
          confidence: Math.min(mapping.confidence, 95), // Cap AI confidence at 95%
        });
      }
    });

    return resultMap;
  } catch (error) {
    console.error('Form Bot: AI analysis failed:', error);
    return new Map();
  }
}

/**
 * Extract contextual text around a field
 */
function extractContextText(element: HTMLElement): string {
  const contextParts: string[] = [];
  
  // Get parent container text
  const parent = element.closest('[role="listitem"]') || 
                 element.closest('div') || 
                 element.parentElement;
  
  if (parent) {
    // Get visible text from parent (excluding the input itself)
    const clone = parent.cloneNode(true) as HTMLElement;
    const inputs = clone.querySelectorAll('input, textarea, select');
    inputs.forEach(inp => inp.remove());
    
    const text = clone.textContent?.trim() || '';
    if (text && text.length < 200) {
      contextParts.push(text);
    }
  }
  
  // Get helper text or descriptions
  const describedBy = element.getAttribute('aria-describedby');
  if (describedBy) {
    const descElement = document.getElementById(describedBy);
    if (descElement) {
      contextParts.push(descElement.textContent?.trim() || '');
    }
  }
  
  return contextParts.join(' ').slice(0, 300); // Limit context length
}

/**
 * Call OpenAI API for field analysis
 */
async function callOpenAI(
  request: AIAnalysisRequest,
  apiKey: string
): Promise<AIFieldMapping[]> {
  const systemPrompt = `You are an expert at matching form fields to user data. 
Given form field information and available user data keys, determine the best match for each field.

Rules:
- Match based on meaning, not just exact text
- Consider context, labels, placeholders, and field types
- Confidence: 95 = perfect match, 80 = good match, 60 = possible match, <60 = no match
- If no good match exists, return confidence 0
- Be smart about variations (e.g., "org name" matches "organizationName")

Respond ONLY with valid JSON array, no explanations.`;

  const userPrompt = `Form fields to analyze:
${request.fields.map((f, i) => `
Field ${i}:
- Label: "${f.label}"
- Placeholder: "${f.placeholder}"
- Name attribute: "${f.name}"
- Type: "${f.type}"
- Context: "${f.contextText}"
`).join('\n')}

Available user data keys:
${request.availableData.map(key => `- ${key}`).join('\n')}

For each field, determine the best matching data key. Return JSON array:
[
  {
    "fieldIndex": 0,
    "matchedKey": "email" or null,
    "confidence": 85,
    "reasoning": "brief explanation"
  }
]`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Form Bot: OpenAI API error:', error);
    throw new Error(`OpenAI API failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No response from OpenAI');
  }

  // Parse response
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.error('Form Bot: Failed to parse AI response:', content);
    throw new Error('Invalid AI response format');
  }

  // Handle both array and object with mappings key
  const mappings = Array.isArray(parsed) ? parsed : (parsed.mappings || []);
  
  return mappings as AIFieldMapping[];
}

/**
 * Get detailed analysis for display
 */
export async function getAIAnalysisExplanation(
  field: DetectedField,
  savedData: FormData
): Promise<string> {
  const settings = await getSettings();
  
  if (!settings.openAIEnabled || !settings.openAIKey) {
    return 'AI analysis not available (not enabled)';
  }

  try {
    const result = await analyzeFieldsWithAI([field], savedData);
    const mapping = result.get(0);
    
    if (mapping) {
      return `AI matched to "${mapping.matchedKey}" with ${mapping.confidence}% confidence`;
    }
    
    return 'AI could not find a good match';
  } catch (error) {
    return 'AI analysis failed';
  }
}

