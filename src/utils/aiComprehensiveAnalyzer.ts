/**
 * Comprehensive AI-powered field analysis
 * Analyzes entire page context + all profile data for intelligent matching
 */

import { FormField } from '../types';
import { getSettings } from './storage';

export interface AIFieldAnalysis {
  fieldIndex: number;
  matchedProfileKey: string | null;
  confidence: number;
  reasoning: string;
}

/**
 * Analyze ALL form fields comprehensively with AI
 */
export async function analyzeAllFieldsWithAI(
  fields: FormField[],
  profileData: { [key: string]: any }
): Promise<Map<number, { matchedKey: string; confidence: number }>> {
  const settings = await getSettings();
  
  if (!settings.openAIEnabled || !settings.openAIKey) {
    console.log('Form Bot: AI not enabled for comprehensive analysis');
    return new Map();
  }

  if (fields.length === 0 || Object.keys(profileData).length === 0) {
    return new Map();
  }

  try {
    console.log('🧠 Starting comprehensive AI field analysis...');
    console.log(`📊 Analyzing ${fields.length} fields against ${Object.keys(profileData).length} profile data points`);
    
    const systemPrompt = `You are an expert at intelligently matching form fields to user profile data.

Analyze the ENTIRE form context and ALL available user data to make smart matches using common sense and contextual understanding.

Rules:
- Consider the full question/label text, not just field names
- Understand context: "What's your passport number?" → passportNumber
- Handle variations: "travel document" = passport, "mobile" = phone
- Use common sense: "Where do you live?" → address
- For ambiguous fields, use surrounding context
- Match semantic meaning, not exact words
- Return null if genuinely no good match exists

Return ONLY valid JSON.`;

    const userPrompt = `Analyze these form fields and match them intelligently to available profile data:

FORM FIELDS:
${fields.map((f, i) => `
${i}. Label: "${f.label}"
   Name: "${f.name}"
   Placeholder: "${f.placeholder}"
   Type: ${f.type}
   Aria-label: "${f.ariaLabel}"
`).join('\n')}

AVAILABLE PROFILE DATA (keys only):
${Object.keys(profileData).map(key => `- ${key}`).join('\n')}

For EACH field (0-${fields.length - 1}), determine the best profile data key to use. Use context and common sense.

Examples:
- "What's your passport or travel document number?" → passportNumber
- "Where do you currently live?" → address  
- "Contact number" → phone
- "Email address for correspondence" → email

Return JSON:
{
  "mappings": [
    {
      "fieldIndex": 0,
      "matchedProfileKey": "passportNumber" or null,
      "confidence": 95,
      "reasoning": "Field asks for passport/travel document number"
    }
  ]
}

Analyze ALL ${fields.length} fields with full context awareness.`;

    console.log('📤 Sending comprehensive analysis request to OpenAI...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.openAIKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('❌ AI analysis failed:', response.status);
      return new Map();
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return new Map();
    }

    const parsed = JSON.parse(content);
    const mappings: AIFieldAnalysis[] = parsed.mappings || [];
    
    console.log(`✅ AI analyzed ${mappings.length} fields`);
    
    // Convert to map
    const resultMap = new Map<number, { matchedKey: string; confidence: number }>();
    
    mappings.forEach(mapping => {
      if (mapping.matchedProfileKey && mapping.confidence > 60) {
        resultMap.set(mapping.fieldIndex, {
          matchedKey: mapping.matchedProfileKey,
          confidence: Math.min(mapping.confidence, 98), // Cap at 98%
        });
        
        console.log(`  ✓ Field ${mapping.fieldIndex}: ${fields[mapping.fieldIndex]?.label} → ${mapping.matchedProfileKey} (${mapping.confidence}%)`);
        console.log(`    Reasoning: ${mapping.reasoning}`);
      }
    });

    return resultMap;
  } catch (error) {
    console.error('Form Bot: Comprehensive AI analysis failed:', error);
    return new Map();
  }
}

/**
 * Apply AI analysis results to detected fields
 */
export function applyAIAnalysisResults(
  detectedFields: any[],
  aiResults: Map<number, { matchedKey: string; confidence: number }>
): any[] {
  const enhanced = [...detectedFields];
  
  aiResults.forEach((result, index) => {
    if (index < enhanced.length) {
      // Only update if AI confidence is higher than current
      if (result.confidence > enhanced[index].confidence) {
        enhanced[index] = {
          ...enhanced[index],
          matchedKey: result.matchedKey,
          confidence: result.confidence,
        };
      }
    }
  });
  
  return enhanced;
}

