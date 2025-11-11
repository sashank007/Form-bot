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
    const systemPrompt = `You are an expert at extracting ALL structured data from resumes, LinkedIn profiles, and personal information.

CRITICAL: Extract EVERY piece of information you find. Create a field for ANYTHING mentioned.

Standard fields: firstName, lastName, fullName, email, phone, address, city, state, zipCode, country, company, jobTitle, website, linkedIn, github

Custom fields (extract if present): skills, experience, education, summary, certifications, languages, awards, publications, personalProjects, projects, portfolio, hobbies, interests, volunteerWork, references, objectives, achievements, licenses, patents, conferences, speakingEngagements, socialMedia, professionalMemberships, militaryService, securityClearance, etc.

Rules:
- Create a camelCase field name for every distinct piece of info
- For text sections (projects, experience), include full content
- For lists (skills, languages), include complete lists
- If you see a section heading, create a field for it
- Be comprehensive - extract EVERYTHING

Return ONLY valid JSON.`;

    const userPrompt = `Extract ALL structured data from this resume/profile. Create a field for every piece of information:

${resumeText}

Return comprehensive JSON with ALL fields found. Include standard AND custom fields:
{
  "firstName": "...",
  "email": "...",
  "skills": "full list",
  "experience": "full work history text",
  "personalProjects": "full project descriptions",
  "certifications": "list of certifications",
  "languages": "languages spoken",
  "portfolio": "portfolio URL",
  "achievements": "notable achievements",
  ...any other field you find...
}

Extract EVERYTHING - be thorough!`;

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
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your OpenAI API key in settings.');
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      } else if (response.status === 402) {
        throw new Error('Insufficient credits. Please add credits to your OpenAI account.');
      } else {
        throw new Error(`OpenAI API failed: ${errorData.error?.message || response.statusText}`);
      }
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
    throw error; // Re-throw to show user-friendly message
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
    const systemPrompt = `You are an expert at filling out forms intelligently using profile/resume data.

Given form fields and extracted profile data, determine the BEST value for each field.

Rules:
- Match semantically and contextually, not just by field names
- For specific fields (name, email, phone): use exact values
- For descriptive fields (projects, experience): extract relevant sections from profile
- For questions ("Why?", "Tell us about..."): craft appropriate answers from profile data
- Match "personal projects" to personalProjects, projects, or portfolio fields
- Match "certifications" to certifications field
- Be intelligent about partial matches (e.g., "your projects" → personalProjects)
- If multiple profile fields could work, choose the most relevant
- If no data exists, return null

Return ONLY valid JSON.`;

    const userPrompt = `Form fields to fill:
${fields.map((f, i) => `${i}. Label: "${f.label}" | Name: "${f.name}" | Type: "${f.type}" | Placeholder: "${f.placeholder}" | Aria: "${f.ariaLabel}"`).join('\n')}

Available profile data:
${JSON.stringify(profileData, null, 2)}

For EACH field, determine the best fill value from the profile. Match intelligently:
- "Personal projects" field → use personalProjects or projects data
- "Tell us about yourself" → use summary or experience
- "Skills" → use skills field
- "Why this company?" → craft from experience/summary
- etc.

Return JSON:
{
  "mappings": [
    {
      "fieldIndex": 0,
      "fillValue": "actual value from profile or crafted answer" or null,
      "dataSource": "which profile field(s) were used"
    }
  ]
}

Be thorough - try to fill every field!`;

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

