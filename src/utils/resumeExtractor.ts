/**
 * AI-Powered Resume/Profile Data Extraction
 */

import { ExtractedProfileData } from '../types';
import { getSettings } from './storage';

/**
 * Extract structured data from resume text using AI
 */
export async function extractProfileFromResume(resumeText: string): Promise<ExtractedProfileData | null> {
  const settings = await getSettings();
  
  if (!settings.openAIEnabled || !settings.openAIKey) {
    return null;
  }

  if (!resumeText || resumeText.trim().length < 50) {
    return null;
  }

  try {
    const systemPrompt = `You are an expert at extracting structured data from resumes, LinkedIn profiles, and personal information text.

Extract all relevant information into a structured JSON format. Include any field you can find.

Common fields: firstName, lastName, email, phone, address, city, state, zipCode, country, company, jobTitle, website, linkedIn, github, skills, experience, education, summary

For skills/experience/education, extract the full text content.
Return ONLY valid JSON, no explanations.`;

    const userPrompt = `Extract structured data from this resume/profile:

${resumeText}

Return JSON with all extracted fields. Example format:
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "555-123-4567",
  "company": "Tech Corp",
  "jobTitle": "Software Engineer",
  "skills": "JavaScript, React, TypeScript...",
  "experience": "5 years at Tech Corp...",
  "summary": "Experienced software engineer...",
  ...
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
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const extracted = JSON.parse(content) as ExtractedProfileData;
    return extracted;
  } catch (error) {
    console.error('Resume extraction failed:', error);
    return null;
  }
}

/**
 * Extract data from LinkedIn URL (future enhancement - would need LinkedIn API or scraping)
 */
export async function extractFromLinkedIn(linkedInUrl: string): Promise<ExtractedProfileData | null> {
  // For now, just return null - this would need LinkedIn API access
  // Or user could paste their LinkedIn "About" section as text
  console.log('LinkedIn extraction not yet implemented');
  return null;
}

/**
 * Intelligent form filling using extracted profile data
 */
export async function fillFormFromProfile(
  fields: Array<{ label: string; name: string; type: string; placeholder: string; ariaLabel: string }>,
  profileData: ExtractedProfileData
): Promise<Map<number, string>> {
  const settings = await getSettings();
  
  if (!settings.openAIEnabled || !settings.openAIKey) {
    return simpleProfileMatch(fields, profileData);
  }

  try {
    const systemPrompt = `You are an expert at filling out forms intelligently.
Given form fields and a user's profile data, determine the best value for each field.

Rules:
- Match semantically, not just by field names
- Consider context, labels, and field types
- For open-ended questions, use summary/experience/education data
- For specific fields, use exact profile values
- If no good data exists for a field, return null for that field

Return ONLY valid JSON array.`;

    const userPrompt = `Form fields:
${fields.map((f, i) => `${i}. Label: "${f.label}" | Name: "${f.name}" | Type: "${f.type}" | Placeholder: "${f.placeholder}"`).join('\n')}

User profile data:
${JSON.stringify(profileData, null, 2)}

For each field, determine what value to fill. Return JSON array:
[
  {
    "fieldIndex": 0,
    "fillValue": "actual value from profile" or null,
    "dataSource": "which profile field was used"
  }
]`;

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
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return simpleProfileMatch(fields, profileData);
    }

    const parsed = JSON.parse(content);
    const mappings = Array.isArray(parsed) ? parsed : (parsed.mappings || []);
    
    const resultMap = new Map<number, string>();
    mappings.forEach((mapping: any) => {
      if (mapping.fillValue !== null && mapping.fillValue !== undefined) {
        resultMap.set(mapping.fieldIndex, mapping.fillValue);
      }
    });

    return resultMap;
  } catch (error) {
    console.error('AI form filling failed:', error);
    return simpleProfileMatch(fields, profileData);
  }
}

/**
 * Simple profile matching (fallback when AI not available)
 */
function simpleProfileMatch(
  fields: Array<{ label: string; name: string; type: string }>,
  profileData: ExtractedProfileData
): Map<number, string> {
  const resultMap = new Map<number, string>();
  
  fields.forEach((field, index) => {
    const normalizedLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Try to match against profile data keys
    for (const [key, value] of Object.entries(profileData)) {
      if (value && normalizedLabel.includes(key.toLowerCase())) {
        resultMap.set(index, value);
        break;
      }
    }
  });
  
  return resultMap;
}

