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

  try {
    const urlResponse = await fetch(`${LAMBDA_API_URL}/api/documents/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: auth.userId,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        documentType
      }),
    });

    if (!urlResponse.ok) {
      const errorData = await urlResponse.json().catch(() => ({}));
      throw new Error(`Failed to get upload URL: ${errorData.error || urlResponse.statusText}`);
    }

    const { uploadUrl, s3Key, s3Url } = await urlResponse.json();

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`S3 upload failed: ${uploadResponse.statusText}`);
    }

    return { s3Url, s3Key, fileName: file.name };
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

