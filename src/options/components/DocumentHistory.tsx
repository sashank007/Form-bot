import React, { useEffect, useState } from 'react';
import { SubmittedDocument } from '../../types';
import { getSubmittedDocuments, deleteSubmittedDocument } from '../../utils/documentStorage';
import { getS3PresignedUrl } from '../../utils/s3Upload';
import { getAuth } from '../../utils/googleAuth';

const DocumentHistory: React.FC = () => {
  const [documents, setDocuments] = useState<SubmittedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<SubmittedDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const auth = await getAuth();
      const docs = await getSubmittedDocuments(auth?.userId);
      console.log('📄 Loaded documents:', docs.length);
      docs.forEach((doc, idx) => {
        console.log(`  Doc ${idx}: ${doc.fileName}, s3Key: ${doc.s3Key || 'MISSING'}, s3Url: ${doc.s3Url || 'MISSING'}`);
      });
      setDocuments(docs);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) {
      return;
    }

    setDeletingId(documentId);
    try {
      await deleteSubmittedDocument(documentId);
      await loadDocuments();
    } catch (error) {
      console.error('Failed to delete document:', error);
      alert('Failed to delete document');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async (doc: SubmittedDocument) => {
    if (!doc.s3Key) {
      alert('Document file not available for download');
      return;
    }

    setDownloadingId(doc.id);
    try {
      // Try to get presigned URL first
      try {
        const presignedUrl = await getS3PresignedUrl(doc.s3Key);
        const link = document.createElement('a');
        link.href = presignedUrl;
        link.download = doc.fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (presignedError) {
        console.warn('Presigned URL failed, trying direct S3 URL:', presignedError);
        if (doc.s3Url) {
          const link = document.createElement('a');
          link.href = doc.s3Url;
          link.download = doc.fileName;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          throw new Error('No download URL available');
        }
      }
    } catch (error) {
      console.error('Failed to download document:', error);
      alert(`Failed to download document: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease make sure you're signed in with Google.`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePreview = async (doc: SubmittedDocument) => {
    if (!doc.s3Key && !doc.s3Url) {
      alert('Document file not available for preview');
      return;
    }

    setPreviewDoc(doc);
    setPreviewLoading(true);
    setPreviewUrl(null);

    try {
      if (doc.s3Key) {
        const presignedUrl = await getS3PresignedUrl(doc.s3Key);
        setPreviewUrl(presignedUrl);
      } else if (doc.s3Url) {
        setPreviewUrl(doc.s3Url);
      }
    } catch (error) {
      console.error('Failed to get preview URL:', error);
      alert('Failed to load document preview');
      setPreviewDoc(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewDoc(null);
    setPreviewUrl(null);
  };

  const isImageFile = (fileType: string) => {
    return fileType.startsWith('image/') || 
           ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].some(ext => fileType.toLowerCase().includes(ext));
  };

  const isPdfFile = (fileType: string) => {
    return fileType === 'application/pdf' || fileType.toLowerCase().includes('pdf');
  };

  const filteredDocuments = filterType === 'all' 
    ? documents 
    : documents.filter(doc => doc.documentType === filterType);

  const documentTypes = Array.from(new Set(documents.map(d => d.documentType)));

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getDocumentTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      drivers_license: "Driver's License",
      passport: 'Passport',
      id_card: 'ID Card',
      insurance: 'Insurance Card',
      pdf: 'PDF Document',
      image: 'Image',
      other: 'Other',
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      {/* Preview Modal */}
      {previewDoc && (
        <div 
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={closePreview}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-xl max-w-4xl max-h-[90vh] w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {previewDoc.fileName}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {getDocumentTypeLabel(previewDoc.documentType)} • {formatFileSize(previewDoc.fileSize)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(previewDoc)}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-primary-purple hover:bg-primary-purple/90 rounded-lg transition-colors"
                >
                  Download
                </button>
                <button
                  onClick={closePreview}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-80px)] flex items-center justify-center bg-gray-100 dark:bg-gray-900">
              {previewLoading ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-2 border-primary-purple border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-gray-600 dark:text-gray-400 mt-4">Loading preview...</p>
                </div>
              ) : previewUrl ? (
                isImageFile(previewDoc.fileType) ? (
                  <img 
                    src={previewUrl} 
                    alt={previewDoc.fileName}
                    className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                  />
                ) : isPdfFile(previewDoc.fileType) ? (
                  <iframe 
                    src={previewUrl}
                    className="w-full h-[70vh] rounded-lg"
                    title={previewDoc.fileName}
                  />
                ) : (
                  <div className="text-center py-12">
                    <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-gray-600 dark:text-gray-400">Preview not available for this file type</p>
                    <button
                      onClick={() => handleDownload(previewDoc)}
                      className="mt-4 px-4 py-2 text-sm font-medium text-white bg-primary-purple hover:bg-primary-purple/90 rounded-lg"
                    >
                      Download to View
                    </button>
                  </div>
                )
              ) : (
                <p className="text-gray-600 dark:text-gray-400">Failed to load preview</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Documents</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Your personal document repository - view and download anytime
        </p>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-gray-800 rounded-card shadow p-8 text-center">
          <div className="w-8 h-8 border-2 border-primary-purple border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-400 mt-4">Loading documents...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-card shadow p-8 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-600 dark:text-gray-400">No documents uploaded yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            Documents from form submissions and document scans will appear here
          </p>
          <div className="mt-4 text-xs text-gray-400 dark:text-gray-500">
            💡 Tip: Use Document Scanner tab to scan IDs, passports, and more
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-card shadow p-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter:</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="all">All Types</option>
                {documentTypes.map(type => (
                  <option key={type} value={type}>{getDocumentTypeLabel(type)}</option>
                ))}
              </select>
              <div className="ml-auto text-sm text-gray-600 dark:text-gray-400">
                {filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="bg-white dark:bg-gray-800 rounded-card shadow p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {doc.fileName}
                      </h3>
                      <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200">
                        {getDocumentTypeLabel(doc.documentType)}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 dark:text-gray-400 mt-4">
                      <div>
                        <span className="font-medium">Size:</span> {formatFileSize(doc.fileSize)}
                      </div>
                      <div>
                        <span className="font-medium">Submitted:</span> {formatDate(doc.submittedAt)}
                      </div>
                      <div>
                        <span className="font-medium">Field:</span> {doc.formFieldLabel || doc.formFieldName}
                      </div>
                      <div>
                        <span className="font-medium">Type:</span> {doc.fileType}
                      </div>
                    </div>

                    {doc.formUrl && (
                      <div className="mt-3">
                        <a
                          href={doc.formUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary-purple hover:underline"
                        >
                          View Form →
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 ml-4 flex-shrink-0">
                    <button
                      onClick={() => handlePreview(doc)}
                      disabled={!doc.s3Key && !doc.s3Url}
                      className="px-3 py-2 text-sm font-medium text-primary-purple hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-purple-200 dark:border-purple-800"
                      title="View document"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      View
                    </button>
                    <button
                      onClick={() => handleDownload(doc)}
                      disabled={downloadingId === doc.id || (!doc.s3Key && !doc.s3Url)}
                      className="px-3 py-2 text-sm font-medium text-white bg-primary-purple hover:bg-primary-purple/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                      title={doc.s3Key || doc.s3Url ? 'Download document' : 'No file available for download'}
                    >
                      {downloadingId === doc.id ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Downloading...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                      className="px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 border border-red-200 dark:border-red-800"
                    >
                      {deletingId === doc.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default DocumentHistory;

