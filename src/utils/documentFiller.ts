import { SubmittedDocument } from '../types';
import { getS3PresignedUrl } from './s3Upload';
import { getSubmittedDocuments } from './documentStorage';

const DOCUMENT_KEYWORDS: { [key: string]: string[] } = {
  drivers_license: ['driver', 'license', 'licence', 'dl', 'driving'],
  passport: ['passport', 'travel document'],
  id_card: ['id card', 'identification', 'national id', 'identity'],
  insurance: ['insurance', 'health card', 'medical card'],
  resume: ['resume', 'cv', 'curriculum vitae'],
  photo: ['photo', 'picture', 'headshot', 'selfie', 'portrait'],
  certificate: ['certificate', 'diploma', 'degree'],
  transcript: ['transcript', 'academic record', 'grades'],
  birth_certificate: ['birth certificate', 'birth cert'],
  ssn: ['ssn', 'social security', 'sin card'],
  tax: ['tax', 'w2', 'w-2', '1099', 'tax return'],
  bank: ['bank statement', 'bank account', 'financial'],
  utility: ['utility', 'utility bill', 'electric bill', 'water bill'],
  lease: ['lease', 'rental agreement', 'tenancy'],
  employment: ['employment', 'offer letter', 'job offer', 'employment letter'],
};

export function matchDocumentTypeFromLabel(label: string): string | null {
  const lowerLabel = label.toLowerCase();
  
  for (const [docType, keywords] of Object.entries(DOCUMENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerLabel.includes(keyword)) {
        return docType;
      }
    }
  }
  return null;
}

export async function findMatchingDocument(fieldLabel: string): Promise<SubmittedDocument | null> {
  const allDocs = await getSubmittedDocuments();
  if (allDocs.length === 0) return null;
  
  const lowerLabel = fieldLabel.toLowerCase();
  const fieldWords = lowerLabel.split(/\s+/).filter(w => w.length > 2);
  
  // Score all documents and return the best match
  const scored = allDocs.map(doc => {
    let score = 0;
    const customLabel = (doc.customLabel || '').toLowerCase();
    const docType = doc.documentType.toLowerCase().replace('_', ' ');
    const fileName = (doc.fileName || '').toLowerCase().replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    
    // Priority 1: Custom label exact match (highest priority)
    if (customLabel && lowerLabel.includes(customLabel)) score += 200;
    if (customLabel && customLabel.includes(lowerLabel)) score += 150;
    
    // Priority 2: File name match
    if (fileName) {
      if (lowerLabel.includes(fileName)) score += 120;
      if (fileName.includes(lowerLabel)) score += 100;
      const fileWords = fileName.split(/\s+/);
      for (const word of fieldWords) {
        if (fileWords.some(fw => fw.includes(word) || word.includes(fw))) score += 40;
      }
    }
    
    // Priority 3: Custom label word overlap
    if (customLabel) {
      const customWords = customLabel.split(/\s+/);
      for (const word of fieldWords) {
        if (customWords.some(cw => cw.includes(word) || word.includes(cw))) score += 50;
      }
    }
    
    // Priority 4: Document type keyword match
    const matchedType = matchDocumentTypeFromLabel(lowerLabel);
    if (matchedType && doc.documentType === matchedType) score += 100;
    
    // Priority 5: Document type word overlap
    for (const word of fieldWords) {
      if (docType.includes(word)) score += 30;
    }
    
    // Priority 6: Form field label match (where doc was originally uploaded)
    const origLabel = (doc.formFieldLabel || '').toLowerCase();
    if (origLabel && lowerLabel.includes(origLabel)) score += 40;
    if (origLabel) {
      for (const word of fieldWords) {
        if (origLabel.includes(word)) score += 20;
      }
    }
    
    return { doc, score };
  });
  
  const best = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score)[0];
  return best?.doc || null;
}

export async function fillFileUploadField(
  element: HTMLInputElement,
  document: SubmittedDocument
): Promise<boolean> {
  if (!document.s3Key) {
    console.warn('Document has no s3Key, cannot fill');
    return false;
  }
  
  try {
    const presignedUrl = await getS3PresignedUrl(document.s3Key);
    
    const response = await fetch(presignedUrl);
    if (!response.ok) {
      throw new Error('Failed to download document from S3');
    }
    
    const blob = await response.blob();
    const file = new File([blob], document.fileName, { type: document.fileType });
    
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    element.files = dataTransfer.files;
    
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    
    console.log(`✅ Auto-filled file upload with: ${document.fileName}`);
    return true;
  } catch (error) {
    console.error('Failed to fill file upload field:', error);
    return false;
  }
}

export async function getSuggestedDocuments(fieldLabel: string): Promise<SubmittedDocument[]> {
  const allDocs = await getSubmittedDocuments();
  const lowerLabel = fieldLabel.toLowerCase();
  const fieldWords = lowerLabel.split(/\s+/).filter(w => w.length > 2);
  
  const scored = allDocs.map(doc => {
    let score = 0;
    const customLabel = (doc.customLabel || '').toLowerCase();
    const docType = doc.documentType.toLowerCase().replace('_', ' ');
    const origLabel = (doc.formFieldLabel || '').toLowerCase();
    const fileName = (doc.fileName || '').toLowerCase().replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    
    // Custom label matches (highest priority)
    if (customLabel) {
      if (lowerLabel.includes(customLabel)) score += 200;
      if (customLabel.includes(lowerLabel)) score += 150;
      const customWords = customLabel.split(/\s+/);
      for (const word of fieldWords) {
        if (customWords.some(cw => cw.includes(word) || word.includes(cw))) score += 50;
      }
    }
    
    // File name match
    if (fileName) {
      if (lowerLabel.includes(fileName)) score += 120;
      if (fileName.includes(lowerLabel)) score += 100;
      const fileWords = fileName.split(/\s+/);
      for (const word of fieldWords) {
        if (fileWords.some(fw => fw.includes(word) || word.includes(fw))) score += 40;
      }
    }
    
    // Document type keyword match
    const matchedType = matchDocumentTypeFromLabel(lowerLabel);
    if (matchedType && doc.documentType === matchedType) score += 100;
    
    // Label contains doc type
    if (lowerLabel.includes(docType)) score += 50;
    if (origLabel && lowerLabel.includes(origLabel)) score += 40;
    
    // Keyword overlap
    for (const word of fieldWords) {
      if (docType.includes(word)) score += 20;
      if (origLabel.includes(word)) score += 15;
    }
    
    // Recency bonus
    const daysSinceUpload = (Date.now() - doc.submittedAt) / (1000 * 60 * 60 * 24);
    if (daysSinceUpload < 30) score += 10;
    
    return { doc, score };
  });
  
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(s => s.doc);
}

