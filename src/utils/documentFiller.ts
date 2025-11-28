import { SubmittedDocument } from '../types';
import { getS3PresignedUrl } from './s3Upload';
import { getDocumentsByType, inferDocumentTypeFromFile } from './documentStorage';

export async function fillFileUploadField(
  element: HTMLInputElement,
  document: SubmittedDocument
): Promise<void> {
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
    
    console.log(`✅ Filled file upload field with document: ${document.fileName}`);
  } catch (error) {
    console.error('Failed to fill file upload field:', error);
    throw error;
  }
}

export async function getSuggestedDocuments(
  field: HTMLInputElement
): Promise<SubmittedDocument[]> {
  const accept = field.getAttribute('accept') || '';
  const fieldLabel = field.getAttribute('aria-label') || field.name || '';
  
  let documentType = 'other';
  
  if (accept.includes('image')) {
    if (fieldLabel.toLowerCase().includes('license') || fieldLabel.toLowerCase().includes('driver')) {
      documentType = 'drivers_license';
    } else if (fieldLabel.toLowerCase().includes('passport')) {
      documentType = 'passport';
    } else if (fieldLabel.toLowerCase().includes('id') || fieldLabel.toLowerCase().includes('identification')) {
      documentType = 'id_card';
    } else if (fieldLabel.toLowerCase().includes('insurance')) {
      documentType = 'insurance';
    } else {
      documentType = 'image';
    }
  } else if (accept.includes('pdf') || accept.includes('application/pdf')) {
    documentType = 'pdf';
  }
  
  const documents = await getDocumentsByType(documentType);
  
  return documents.sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 10);
}

