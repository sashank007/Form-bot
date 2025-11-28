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

CRITICAL: Use section headers, nearby fields, and form purpose to disambiguate ambiguous fields.

Rules:
- Consider the full question/label text, not just field names
- Use section headers: "Name" in "Pet Information" section → petName (NOT fullName)
- Use nearby fields: "Name" with nearby ["Breed", "Age"] → petName
- Use form purpose: Pet registration form → pet-related fields match pet profile keys
- Understand context: "What's your passport number?" → passportNumber
- Handle variations: "travel document" = passport, "mobile" = phone
- Use common sense: "Where do you live?" → address
- For ambiguous fields, use surrounding context
- Match semantic meaning, not exact words
- Return null if genuinely no good match exists

Return ONLY valid JSON.`;

    const formWideContext = fields.length > 0 && fields[0].context?.formPurpose 
      ? `\nFORM PURPOSE: ${fields[0].context.formPurpose}`
      : '';
    
    const pageTitle = document.title ? `\nPAGE TITLE: ${document.title}` : '';
    
    const fieldsBySection = new Map<string, FormField[]>();
    fields.forEach(f => {
      const section = f.context?.sectionHeader || 'No Section';
      if (!fieldsBySection.has(section)) {
        fieldsBySection.set(section, []);
      }
      fieldsBySection.get(section)!.push(f);
    });
    
    const sectionsInfo = Array.from(fieldsBySection.entries()).map(([section, sectionFields]) => {
      const fieldLabels = sectionFields.map(f => f.label || f.name).filter(l => l.length > 0);
      return `  "${section}": [${fieldLabels.join(', ')}]`;
    }).join('\n');
    
    const userPrompt = `Analyze these form fields and match them intelligently to available profile data:${formWideContext}${pageTitle}

FORM STRUCTURE (fields grouped by section):
${sectionsInfo}

FORM FIELDS WITH CONTEXT:
${fields.map((f, i) => {
  const contextParts: string[] = [];
  if (f.context?.sectionHeader) {
    contextParts.push(`Section: "${f.context.sectionHeader}"`);
  }
  if (f.context?.nearbyFields && f.context.nearbyFields.length > 0) {
    const nearbyLabels = f.context.nearbyFields.map(nf => nf.label).filter(l => l.length > 0);
    if (nearbyLabels.length > 0) {
      contextParts.push(`Nearby: ${nearbyLabels.join(', ')}`);
    }
  }
  const contextStr = contextParts.length > 0 ? ` | ${contextParts.join(' | ')}` : '';
  
  return `
${i}. Label: "${f.label}"
   Name: "${f.name}"
   Placeholder: "${f.placeholder}"
   Type: ${f.type}${contextStr}`;
}).join('\n')}

AVAILABLE PROFILE DATA (keys only):
${Object.keys(profileData).map(key => `- ${key}`).join('\n')}

For EACH field (0-${fields.length - 1}), determine the best profile data key to use. Use CONTEXT to disambiguate.

CONTEXT RULES:
- If field is in "Pet Information" section with nearby ["Breed", "Age"], "Name" → petName
- If field is in "Personal Information" section with nearby ["Email"], "Name" → fullName or firstName
- If form purpose is "Pet Registration", pet-related fields → pet profile keys
- Use section headers and nearby fields to understand field grouping

Examples:
- Field "Name" in "Pet Information" section with nearby ["Breed"] → petName (NOT fullName)
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

Analyze ALL ${fields.length} fields with full context awareness, using sections and nearby fields to disambiguate.`;

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

