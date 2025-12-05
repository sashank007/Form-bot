import { SubmittedDocument } from '../types';
import { LAMBDA_API_URL } from '../config/constants';
import { getAuth } from './googleAuth';

const STORAGE_KEY = 'formbot_submitted_documents';

export async function saveSubmittedDocument(doc: SubmittedDocument): Promise<void> {
  const localDocs = await getSubmittedDocumentsLocal();
  const existingIndex = localDocs.findIndex(d => d.id === doc.id);
  
  if (existingIndex >= 0) {
    localDocs[existingIndex] = doc;
  } else {
    localDocs.push(doc);
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: localDocs });

  const auth = await getAuth();
  if (auth) {
    try {
      await fetch(`${LAMBDA_API_URL}/api/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(doc),
      });
    } catch (error) {
      console.warn('Failed to sync document to cloud:', error);
    }
  }
}

export async function getSubmittedDocuments(userId?: string): Promise<SubmittedDocument[]> {
  const auth = await getAuth();
  const targetUserId = userId || auth?.userId;
  const localDocs = await getSubmittedDocumentsLocal();

  if (!targetUserId) {
    return localDocs;
  }

  try {
    const response = await fetch(`${LAMBDA_API_URL}/api/documents?userId=${encodeURIComponent(targetUserId)}`);
    if (response.ok) {
      const data = await response.json();
      const cloudDocs: SubmittedDocument[] = data.documents || [];
      
      // Merge: cloud docs take precedence, but keep local docs not in cloud
      const cloudIds = new Set(cloudDocs.map(d => d.id));
      const localOnly = localDocs.filter(d => !cloudIds.has(d.id));
      const merged = [...cloudDocs, ...localOnly];
      
      await chrome.storage.local.set({ [STORAGE_KEY]: merged });
      return merged.sort((a, b) => b.submittedAt - a.submittedAt);
    }
  } catch (error) {
    console.warn('Failed to fetch documents from cloud, using local:', error);
  }

  return localDocs;
}

async function getSubmittedDocumentsLocal(): Promise<SubmittedDocument[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

export async function getDocumentsByType(documentType: string): Promise<SubmittedDocument[]> {
  const docs = await getSubmittedDocuments();
  return docs.filter(doc => doc.documentType === documentType);
}

export async function deleteSubmittedDocument(documentId: string): Promise<void> {
  const localDocs = await getSubmittedDocumentsLocal();
  const filtered = localDocs.filter(d => d.id !== documentId);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });

  const auth = await getAuth();
  if (auth) {
    try {
      await fetch(`${LAMBDA_API_URL}/api/documents/${documentId}?userId=${encodeURIComponent(auth.userId)}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.warn('Failed to delete document from cloud:', error);
    }
  }
}

export function inferDocumentTypeFromFile(file: File, fieldLabel: string = ''): string {
  const fileName = file.name.toLowerCase();
  const label = fieldLabel.toLowerCase();
  const fileType = file.type.toLowerCase();

  if (fileName.includes('license') || label.includes('license') || label.includes('driver')) {
    return 'drivers_license';
  }
  if (fileName.includes('passport') || label.includes('passport')) {
    return 'passport';
  }
  if (fileName.includes('id') || label.includes('id') || label.includes('identification')) {
    return 'id_card';
  }
  if (fileName.includes('insurance') || label.includes('insurance')) {
    return 'insurance';
  }
  if (fileType.includes('pdf')) {
    return 'pdf';
  }
  if (fileType.includes('image')) {
    return 'image';
  }

  return 'other';
}

