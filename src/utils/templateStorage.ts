/**
 * Template storage and management
 */

import { FormTemplate } from '../types';

const STORAGE_KEY = 'formbot_templates';

/**
 * Save a form template
 */
export async function saveTemplate(template: FormTemplate): Promise<void> {
  const allTemplates = await getAllTemplates();
  const existingIndex = allTemplates.findIndex(t => t.id === template.id);
  
  if (existingIndex >= 0) {
    allTemplates[existingIndex] = template;
  } else {
    allTemplates.push(template);
  }
  
  await chrome.storage.local.set({ [STORAGE_KEY]: allTemplates });
}

/**
 * Get all templates
 */
export async function getAllTemplates(): Promise<FormTemplate[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

/**
 * Get template by ID
 */
export async function getTemplateById(id: string): Promise<FormTemplate | null> {
  const templates = await getAllTemplates();
  return templates.find(t => t.id === id) || null;
}

/**
 * Delete template
 */
export async function deleteTemplate(id: string): Promise<void> {
  const templates = await getAllTemplates();
  const filtered = templates.filter(t => t.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

/**
 * Find matching templates for current page
 */
export async function findMatchingTemplates(
  url: string,
  fieldStructure: string[]
): Promise<Array<{ template: FormTemplate; score: number; reason: string }>> {
  const templates = await getAllTemplates();
  const matches: Array<{ template: FormTemplate; score: number; reason: string }> = [];

  for (const template of templates) {
    let score = 0;
    const reasons: string[] = [];

    // URL pattern matching
    if (matchesUrlPattern(url, template.urlPattern)) {
      score += 60;
      reasons.push('URL match');
    }

    // Field structure similarity
    const structureSimilarity = calculateStructureSimilarity(fieldStructure, template.fieldStructure);
    if (structureSimilarity > 0.5) {
      score += structureSimilarity * 40;
      reasons.push(`${Math.floor(structureSimilarity * 100)}% field match`);
    }

    if (score > 50) {
      matches.push({
        template,
        score,
        reason: reasons.join(', '),
      });
    }
  }

  // Sort by score (highest first)
  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Check if URL matches pattern
 */
function matchesUrlPattern(url: string, pattern: string): boolean {
  try {
    const urlObj = new URL(url);
    const patternObj = new URL(pattern);

    // Check domain
    if (urlObj.hostname !== patternObj.hostname) {
      return false;
    }

    // Check path pattern (supports wildcards)
    const urlPath = urlObj.pathname;
    const patternPath = patternObj.pathname.replace(/\*/g, '.*');
    const regex = new RegExp(`^${patternPath}$`);

    return regex.test(urlPath);
  } catch (e) {
    // If pattern is not a full URL, just check if URL contains it
    return url.includes(pattern);
  }
}

/**
 * Calculate similarity between two field structures
 */
function calculateStructureSimilarity(fields1: string[], fields2: string[]): number {
  if (fields1.length === 0 || fields2.length === 0) {
    return 0;
  }

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalized1 = fields1.map(normalize);
  const normalized2 = fields2.map(normalize);

  let matches = 0;
  for (const field1 of normalized1) {
    if (normalized2.includes(field1)) {
      matches++;
    }
  }

  // Return percentage of matching fields
  return matches / Math.max(fields1.length, fields2.length);
}

/**
 * Increment template usage count
 */
export async function incrementTemplateUsage(templateId: string): Promise<void> {
  const template = await getTemplateById(templateId);
  if (template) {
    template.usageCount++;
    template.updatedAt = Date.now();
    await saveTemplate(template);
  }
}

