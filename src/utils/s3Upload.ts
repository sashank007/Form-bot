import { LAMBDA_API_URL } from '../config/constants';
import { getAuth } from './googleAuth';

export interface S3UploadResponse {
  s3Url: string;
  s3Key: string;
  fileName: string;
}

export async function uploadDocumentToS3(
  file: File,
  documentType: string
): Promise<S3UploadResponse> {
  const auth = await getAuth();
  if (!auth) {
    throw new Error('Not signed in. Please sign in with Google first.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('documentType', documentType);
  formData.append('userId', auth.userId);

  try {
    const response = await fetch(`${LAMBDA_API_URL}/api/documents/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Upload failed: ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    return {
      s3Url: data.s3Url,
      s3Key: data.s3Key,
      fileName: file.name,
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    throw error;
  }
}

export async function getS3PresignedUrl(s3Key: string): Promise<string> {
  const auth = await getAuth();
  if (!auth) {
    throw new Error('Not signed in');
  }

  try {
    const response = await fetch(
      `${LAMBDA_API_URL}/api/documents/presigned-url?s3Key=${encodeURIComponent(s3Key)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to get presigned URL');
    }

    const data = await response.json();
    return data.presignedUrl;
  } catch (error) {
    console.error('Presigned URL error:', error);
    throw error;
  }
}

