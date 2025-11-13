/**
 * Advanced Field Purpose Identifier
 * Uses multiple signals and heuristic scoring + AI fallback
 */

import { FormField, FieldType } from '../types';
import { normalizeString } from './fieldClassifier';
import { getSettings } from './storage';

export interface FieldSignals {
  labelText: string;
  placeholderText: string;
  nameAttr: string;
  idAttr: string;
  ariaLabel: string;
  parentText: string;
  proximityText: string;
  inputType: string;
}

export interface PurposeScore {
  purpose: string;
  score: number;
  signals: string[];
}

/**
 * Extract all signals from a field
 */
export function extractFieldSignals(field: FormField): FieldSignals {
  const element = field.element;
  
  // Get parent node text
  const parentText = element.parentElement?.textContent?.replace(field.value, '').trim() || '';
  
  // Get proximity text (text nodes near the input)
  const proximityText = getProximityText(element);
  
  return {
    labelText: field.label,
    placeholderText: field.placeholder,
    nameAttr: field.name,
    idAttr: field.id,
    ariaLabel: field.ariaLabel,
    parentText: parentText.slice(0, 200), // Limit length
    proximityText: proximityText.slice(0, 200),
    inputType: field.type,
  };
}

/**
 * Get text near the input element
 */
function getProximityText(element: Element): string {
  const texts: string[] = [];
  
  // Check previous siblings
  let prev = element.previousElementSibling;
  for (let i = 0; i < 2 && prev; i++) {
    if (prev.textContent) {
      texts.push(prev.textContent.trim());
    }
    prev = prev.previousElementSibling;
  }
  
  // Check next siblings
  let next = element.nextElementSibling;
  for (let i = 0; i < 2 && next; i++) {
    if (next.textContent) {
      texts.push(next.textContent.trim());
    }
    next = next.nextElementSibling;
  }
  
  return texts.join(' ');
}

/**
 * Score field purpose using heuristics
 */
export function scoreFieldPurpose(signals: FieldSignals): PurposeScore[] {
  const scores: Map<string, { score: number; signals: string[] }> = new Map();
  
  // Combine all text signals
  const allText = normalizeString(`
    ${signals.labelText}
    ${signals.placeholderText}
    ${signals.nameAttr}
    ${signals.idAttr}
    ${signals.ariaLabel}
    ${signals.parentText}
    ${signals.proximityText}
  `);
  
  // Define patterns with weighted scores
  const patterns: { purpose: string; keywords: string[]; weight: number }[] = [
    // Name fields
    { purpose: 'firstName', keywords: ['firstname', 'fname', 'givenname', 'first'], weight: 0.8 },
    { purpose: 'middleName', keywords: ['middlename', 'mname', 'middle'], weight: 0.9 },
    { purpose: 'lastName', keywords: ['lastname', 'lname', 'surname', 'family', 'last'], weight: 0.8 },
    { purpose: 'fullName', keywords: ['fullname', 'name', 'completename'], weight: 0.7 },
    
    // Contact
    { purpose: 'email', keywords: ['email', 'mail', 'emailaddress'], weight: 0.9 },
    { purpose: 'phone', keywords: ['phone', 'telephone', 'mobile', 'cell', 'tel'], weight: 0.85 },
    
    // Address
    { purpose: 'address', keywords: ['address', 'street', 'addressline'], weight: 0.85 },
    { purpose: 'city', keywords: ['city', 'town', 'municipality'], weight: 0.9 },
    { purpose: 'state', keywords: ['state', 'province', 'region'], weight: 0.85 },
    { purpose: 'zipCode', keywords: ['zip', 'postal', 'postcode', 'zipcode'], weight: 0.9 },
    { purpose: 'country', keywords: ['country', 'nation'], weight: 0.9 },
    
    // Birth/Demographics
    { purpose: 'dateOfBirth', keywords: ['dob', 'birthdate', 'dateofbirth', 'birthday'], weight: 0.9 },
    { purpose: 'placeOfBirth', keywords: ['birthplace', 'placeofbirth', 'born'], weight: 0.9 },
    { purpose: 'age', keywords: ['age', 'years'], weight: 0.8 },
    { purpose: 'gender', keywords: ['gender', 'sex'], weight: 0.95 },
    { purpose: 'maritalStatus', keywords: ['marital', 'married', 'single'], weight: 0.9 },
    
    // IDs
    { purpose: 'passportNumber', keywords: ['passport', 'passportnumber', 'traveldocument'], weight: 0.9 },
    { purpose: 'ssn', keywords: ['ssn', 'socialsecurity', 'social'], weight: 0.95 },
    { purpose: 'driversLicense', keywords: ['license', 'driverslicense', 'drivinglicense'], weight: 0.9 },
    
    // Work
    { purpose: 'company', keywords: ['company', 'employer', 'organization'], weight: 0.85 },
    { purpose: 'jobTitle', keywords: ['jobtitle', 'title', 'position', 'occupation'], weight: 0.8 },
  ];
  
  // Score each pattern
  patterns.forEach(pattern => {
    let matchScore = 0;
    const matchedSignals: string[] = [];
    
    pattern.keywords.forEach(keyword => {
      const normalized = normalizeString(keyword);
      
      // Check exact matches in different signals (weighted)
      if (normalizeString(signals.labelText).includes(normalized)) {
        matchScore += pattern.weight * 1.0; // Label is most reliable
        matchedSignals.push(`label:"${keyword}"`);
      }
      
      if (normalizeString(signals.nameAttr).includes(normalized)) {
        matchScore += pattern.weight * 0.9; // Name attribute is very reliable
        matchedSignals.push(`name:"${keyword}"`);
      }
      
      if (normalizeString(signals.idAttr).includes(normalized)) {
        matchScore += pattern.weight * 0.85; // ID is reliable
        matchedSignals.push(`id:"${keyword}"`);
      }
      
      if (normalizeString(signals.placeholderText).includes(normalized)) {
        matchScore += pattern.weight * 0.7; // Placeholder is good hint
        matchedSignals.push(`placeholder:"${keyword}"`);
      }
      
      if (normalizeString(signals.ariaLabel).includes(normalized)) {
        matchScore += pattern.weight * 0.8; // Aria-label is reliable
        matchedSignals.push(`aria:"${keyword}"`);
      }
      
      if (normalizeString(signals.proximityText).includes(normalized)) {
        matchScore += pattern.weight * 0.6; // Nearby text is contextual
        matchedSignals.push(`proximity:"${keyword}"`);
      }
    });
    
    if (matchScore > 0) {
      const existing = scores.get(pattern.purpose);
      if (!existing || matchScore > existing.score) {
        scores.set(pattern.purpose, {
          score: Math.min(matchScore, 1.0), // Cap at 1.0
          signals: matchedSignals,
        });
      }
    }
  });
  
  // Bonus for input type hints
  if (signals.inputType === 'email') {
    const emailScore = scores.get('email') || { score: 0, signals: [] };
    emailScore.score = Math.min(emailScore.score + 0.3, 1.0);
    emailScore.signals.push('type:email');
    scores.set('email', emailScore);
  }
  
  if (signals.inputType === 'tel') {
    const phoneScore = scores.get('phone') || { score: 0, signals: [] };
    phoneScore.score = Math.min(phoneScore.score + 0.3, 1.0);
    phoneScore.signals.push('type:tel');
    scores.set('phone', phoneScore);
  }
  
  // Convert to array and sort by score
  const results: PurposeScore[] = Array.from(scores.entries()).map(([purpose, data]) => ({
    purpose,
    score: data.score,
    signals: data.signals,
  }));
  
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Identify field purpose with AI fallback
 */
export async function identifyFieldPurpose(
  field: FormField,
  availableProfileKeys: string[]
): Promise<{ purpose: string; confidence: number } | null> {
  // Extract signals
  const signals = extractFieldSignals(field);
  
  // Score with heuristics
  const scores = scoreFieldPurpose(signals);
  
  console.log('Field Purpose Identifier:', {
    field: field.label || field.name,
    topScores: scores.slice(0, 3),
  });
  
  // If we have a high-confidence match (>0.7), use it
  if (scores.length > 0 && scores[0].score > 0.7) {
    return {
      purpose: scores[0].purpose,
      confidence: Math.floor(scores[0].score * 100),
    };
  }
  
  // If score is low or ambiguous, use AI fallback
  if (scores.length === 0 || scores[0].score < 0.5) {
    const settings = await getSettings();
    
    if (settings.openAIEnabled && settings.openAIKey) {
      console.log('Field Purpose: Low confidence, using AI fallback...');
      return await identifyWithAI(signals, availableProfileKeys);
    }
  }
  
  // Return best heuristic match or null
  return scores.length > 0 ? {
    purpose: scores[0].purpose,
    confidence: Math.floor(scores[0].score * 100),
  } : null;
}

/**
 * Use AI to identify field purpose
 */
async function identifyWithAI(
  signals: FieldSignals,
  availableKeys: string[]
): Promise<{ purpose: string; confidence: number } | null> {
  const settings = await getSettings();
  
  if (!settings.openAIEnabled || !settings.openAIKey) {
    return null;
  }

  try {
    const systemPrompt = `You are an expert at identifying the purpose of form fields.

Given all available signals about a field, determine what data it's asking for.

Return ONLY valid JSON.`;

    const userPrompt = `Identify this field's purpose:

Signals:
- Label: "${signals.labelText}"
- Placeholder: "${signals.placeholderText}"
- Name attribute: "${signals.nameAttr}"
- ID: "${signals.idAttr}"
- Aria-label: "${signals.ariaLabel}"
- Parent text: "${signals.parentText}"
- Nearby text: "${signals.proximityText}"
- Input type: ${signals.inputType}

Available profile data keys:
${availableKeys.join(', ')}

What is this field asking for? Return JSON:
{
  "purpose": "firstName" or best matching profile key,
  "confidence": 85,
  "reasoning": "Field asks for first name based on label and name attribute"
}`;

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
        max_tokens: 200,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return null;
    }

    const result = JSON.parse(content);
    
    console.log('AI Field Purpose:', result);
    
    return {
      purpose: result.purpose,
      confidence: Math.min(result.confidence, 95),
    };
  } catch (error) {
    console.error('AI field purpose identification failed:', error);
    return null;
  }
}

/**
 * Get detailed field analysis for debugging
 */
export function analyzeField(field: FormField): void {
  const signals = extractFieldSignals(field);
  const scores = scoreFieldPurpose(signals);
  
  console.log('━━━━━ Field Analysis ━━━━━');
  console.log('Field:', field.label || field.name || 'Unknown');
  console.log('\n📡 Signals:');
  console.log('  Label:', signals.labelText);
  console.log('  Placeholder:', signals.placeholderText);
  console.log('  Name:', signals.nameAttr);
  console.log('  ID:', signals.idAttr);
  console.log('  Type:', signals.inputType);
  console.log('  Aria:', signals.ariaLabel);
  console.log('  Parent text:', signals.parentText.slice(0, 50) + '...');
  console.log('  Proximity:', signals.proximityText.slice(0, 50) + '...');
  
  console.log('\n📊 Heuristic Scores:');
  scores.slice(0, 5).forEach((score, i) => {
    console.log(`  ${i + 1}. ${score.purpose}: ${(score.score * 100).toFixed(0)}%`);
    console.log(`     Signals: ${score.signals.join(', ')}`);
  });
  
  console.log('━━━━━━━━━━━━━━━━━━━━━\n');
}

