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
  
  // Try exact document type match first
  const matchedType = matchDocumentTypeFromLabel(lowerLabel);
  if (matchedType) {
    const typeMatch = allDocs.find(d => d.documentType === matchedType);
    if (typeMatch) return typeMatch;
  }
  
  // Try matching by document label (for custom labels)
  for (const doc of allDocs) {
    const docLabel = doc.documentType.toLowerCase();
    if (lowerLabel.includes(docLabel) || docLabel.includes(lowerLabel.split(' ')[0])) {
      return doc;
    }
  }
  
  // Try keyword matching against document labels
  for (const doc of allDocs) {
    const docLabelLower = (doc.formFieldLabel || doc.documentType).toLowerCase();
    const labelWords = lowerLabel.split(/\s+/);
    for (const word of labelWords) {
      if (word.length > 3 && docLabelLower.includes(word)) {
        return doc;
      }
    }
  }
  
  return null;
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
  
  // Score documents by relevance
  const scored = allDocs.map(doc => {
    let score = 0;
    const docType = doc.documentType.toLowerCase();
    const docLabel = (doc.formFieldLabel || '').toLowerCase();
    
    // Exact type match
    const matchedType = matchDocumentTypeFromLabel(lowerLabel);
    if (matchedType && doc.documentType === matchedType) score += 100;
    
    // Label contains doc type
    if (lowerLabel.includes(docType)) score += 50;
    if (docLabel && lowerLabel.includes(docLabel)) score += 50;
    
    // Keyword overlap
    const labelWords = lowerLabel.split(/\s+/);
    for (const word of labelWords) {
      if (word.length > 3) {
        if (docType.includes(word)) score += 20;
        if (docLabel.includes(word)) score += 20;
      }
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

