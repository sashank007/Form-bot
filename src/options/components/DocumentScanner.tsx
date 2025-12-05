/**
 * Document Scanner - Extract data from ID images using AI Vision
 */

import React, { useState, useEffect } from 'react';
import { Settings, SavedFormData } from '../../types';
import { extractFromDocumentImage, validateImageFile } from '../../utils/documentScanner';
import { saveFormData, getAllFormData } from '../../utils/storage';
import { uploadDocumentToS3 } from '../../utils/s3Upload';
import { saveSubmittedDocument } from '../../utils/documentStorage';
import { getAuth } from '../../utils/googleAuth';

interface DocumentScannerProps {
  settings: Settings;
}

const DocumentScanner: React.FC<DocumentScannerProps> = ({ settings }) => {
  const [scanning, setScanning] = useState(false);
  const [documentType, setDocumentType] = useState<'drivers_license' | 'passport' | 'id_card' | 'insurance' | 'other'>('drivers_license');
  const [customDocumentLabel, setCustomDocumentLabel] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [extractedCount, setExtractedCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [scannedProfiles, setScannedProfiles] = useState<SavedFormData[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadScannedDocuments();
  }, []);

  const loadScannedDocuments = async () => {
    try {
      const allProfiles = await getAllFormData();
      // Filter profiles that were created from document scans (they have IDs starting with "scan_")
      const scanned = allProfiles.filter(p => p.id.startsWith('scan_'));
      setScannedProfiles(scanned.sort((a, b) => b.createdAt - a.createdAt));
    } catch (error) {
      console.error('Failed to load scanned documents:', error);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('File dropped');
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (!file) {
      console.log('No file in drop');
      return;
    }
    
    console.log('Processing dropped file:', file.name, file.type);
    await processFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) {
      console.log('Drag over - setting isDragging true');
      setIsDragging(true);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Drag enter');
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if leaving the drop zone itself (not child elements)
    if (e.currentTarget === e.target) {
      console.log('Drag leave');
      setIsDragging(false);
    }
  };

  const processFile = async (file: File) => {
    console.log('processFile called with:', file.name, file.type, file.size);
    
    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    console.log('Showing preview and starting scan...');
    setScanning(true); // Show scanning state immediately
    
    // Show preview for images (PDFs will show during conversion)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        console.log('Preview loaded');
        setPreview(event.target?.result as string);
      };
      reader.onerror = () => {
        console.error('Failed to read file');
      };
      reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf') {
      console.log('PDF detected - will convert to image automatically');
    }

    // Scan document
    await scanDocument(file);
  };

  const scanDocument = async (file: File) => {
    if (!settings.openAIEnabled || !settings.openAIKey) {
      setScanning(false);
      alert('Please enable AI and add your OpenAI API key first.\n\nGo to Privacy & Settings tab.');
      return;
    }

    if (!settings.openAIKey.startsWith('sk-')) {
      setScanning(false);
      alert('Invalid API key format. Please check your OpenAI API key.');
      return;
    }

    console.log('🚀 Starting document scan...');
    console.log('📄 File:', file.name, file.type, (file.size / 1024).toFixed(1) + 'KB');
    console.log('🔑 API Key:', settings.openAIKey.substring(0, 10) + '...');
    console.log('📋 Document type:', documentType);

    try {
      console.log('⏳ Calling OpenAI API...');
      const extractedData = await extractFromDocumentImage(file, documentType);
      console.log('✅ OpenAI response received');

      if (!extractedData) {
        alert('Failed to extract data from document. Please try again.');
        return;
      }

      // Flatten complex data
      const flattenedData: { [key: string]: string } = {};
      
      for (const [key, value] of Object.entries(extractedData)) {
        if (value) {
          if (Array.isArray(value) && value.length === 0) continue;
          if (typeof value === 'object' && Object.keys(value).length === 0) continue;
          
          if (typeof value === 'object') {
            flattenedData[key] = JSON.stringify(value, null, 2);
          } else {
            const stringValue = String(value).trim();
            if (stringValue.length > 0) {
              flattenedData[key] = stringValue;
            }
          }
        }
      }

      const fieldCount = Object.keys(flattenedData).length;
      
      // Upload original file to S3
      let s3Url = '';
      let s3Key = '';
      const auth = await getAuth();
      
      if (auth) {
        try {
          console.log('📤 Uploading scanned document to S3...');
          const uploadResult = await uploadDocumentToS3(file, documentType);
          s3Url = uploadResult.s3Url;
          s3Key = uploadResult.s3Key;
          console.log(`✅ Document uploaded to S3: ${s3Url}`);
          
          // Save document metadata for download
          const submittedDoc = {
            id: `scan_doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId: auth.userId,
            s3Url: uploadResult.s3Url,
            s3Key: uploadResult.s3Key,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            documentType: documentType,
            customLabel: customDocumentLabel.trim() || undefined,
            formUrl: '',
            formFieldName: 'scanner',
            formFieldLabel: 'Document Scanner',
            submittedAt: Date.now(),
          };
          
          await saveSubmittedDocument(submittedDoc);
          console.log('✅ Document metadata saved');
        } catch (uploadError) {
          console.warn('⚠️ Failed to upload scanned document to S3:', uploadError);
          // Continue even if S3 upload fails - still save the profile
        }
      } else {
        console.warn('⚠️ Not signed in - skipping S3 upload for scanned document');
      }
      
      // Save as new profile
      const profileName = documentType === 'other' && customDocumentLabel.trim()
        ? `${customDocumentLabel.trim()} Scan`
        : `${documentType.replace('_', ' ')} Scan`;
      
      const newProfile: SavedFormData = {
        id: `scan_${Date.now()}`,
        name: profileName,
        data: flattenedData,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveFormData(newProfile);
      
      setExtractedCount(fieldCount);
      
      // Reload scanned documents list
      await loadScannedDocuments();
      
      const successMessage = s3Url 
        ? `✅ Success!\n\nExtracted ${fieldCount} fields from ${documentType === 'other' && customDocumentLabel.trim() ? customDocumentLabel.trim() : documentType.replace('_', ' ')}.\n\nSaved as new profile: "${newProfile.name}"\n\nOriginal document saved to cloud storage.\n\nGo to Data Management tab to view and edit, or Documents tab to download.`
        : `✅ Success!\n\nExtracted ${fieldCount} fields from ${documentType === 'other' && customDocumentLabel.trim() ? customDocumentLabel.trim() : documentType.replace('_', ' ')}.\n\nSaved as new profile: "${newProfile.name}"\n\nNote: Original file not saved (sign in with Google to enable cloud storage).\n\nGo to Data Management tab to view and edit.`;
      
      alert(successMessage);
      
      // Clear preview and custom label after success
      setTimeout(() => {
        setPreview(null);
        setExtractedCount(0);
        setCustomDocumentLabel('');
      }, 3000);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('Invalid API key')) {
        alert('❌ Invalid API Key\n\nPlease check your OpenAI API key in Privacy & Settings.');
      } else if (errorMessage.includes('credits')) {
        alert('❌ Insufficient Credits\n\nPlease add credits to your OpenAI account.');
      } else {
        alert(`Failed to scan document:\n\n${errorMessage}`);
      }
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Document Scanner</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Upload ID, passport, or license images - AI extracts all information
        </p>
      </div>

      {/* Document Type Selector */}
      <div className="bg-white dark:bg-gray-800 rounded-card shadow p-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Document Type:
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { value: 'drivers_license', label: "Driver's License", icon: '🚗' },
            { value: 'passport', label: 'Passport', icon: '✈️' },
            { value: 'id_card', label: 'ID Card', icon: '🆔' },
            { value: 'insurance', label: 'Insurance Card', icon: '🏥' },
            { value: 'other', label: 'Other Document', icon: '📄' },
          ].map(type => (
            <button
              key={type.value}
              onClick={() => {
                setDocumentType(type.value as any);
                if (type.value !== 'other') {
                  setCustomDocumentLabel('');
                }
              }}
              className={`p-4 rounded-lg border-2 transition-all ${
                documentType === type.value
                  ? 'border-primary-purple bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="text-3xl mb-2">{type.icon}</div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {type.label}
              </div>
            </button>
          ))}
        </div>
        
        {/* Custom Label Input for "Other Document" */}
        {documentType === 'other' && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Document Label:
            </label>
            <input
              type="text"
              value={customDocumentLabel}
              onChange={(e) => setCustomDocumentLabel(e.target.value)}
              placeholder="e.g., Certificate, Diploma, Contract..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Enter a label to identify this document type
            </p>
          </div>
        )}
      </div>

      {/* Upload Area */}
      <div className="bg-white dark:bg-gray-800 rounded-card shadow p-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Upload Document Image:
        </label>
        
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 ${
            isDragging
              ? 'border-primary-purple bg-purple-50 dark:bg-purple-900/20 scale-105'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-purple'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
        >
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileSelect}
            disabled={scanning || !settings.openAIEnabled}
            className="hidden"
            id="document-upload"
          />
          <label
            htmlFor="document-upload"
            className="cursor-pointer block"
          >
            {preview ? (
              <div className="space-y-4">
                <img src={preview} alt="Document preview" className="max-h-64 mx-auto rounded-lg shadow-md" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {scanning ? 'Scanning document...' : 'Click to upload a different image'}
                </p>
              </div>
            ) : (
              <div>
                <svg className={`w-16 h-16 mx-auto mb-4 ${isDragging ? 'text-primary-purple' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className={`font-medium mb-2 ${isDragging ? 'text-primary-purple' : 'text-gray-700 dark:text-gray-300'}`}>
                  {scanning ? 'Scanning...' : isDragging ? 'Drop image here' : 'Click to upload or drag and drop'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  JPG, PNG, WebP, or PDF (max 20MB)
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  PDFs auto-convert to images
                </p>
              </div>
            )}
          </label>
        </div>

        {scanning && (
          <div className="mt-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
            <div className="flex items-center">
              <div className="w-5 h-5 border-2 border-primary-purple border-t-transparent rounded-full animate-spin mr-3"></div>
              <div>
                <p className="text-sm text-purple-900 dark:text-purple-100 font-medium">
                  Processing document...
                </p>
                <p className="text-xs text-purple-700 dark:text-purple-200 mt-1">
                  {preview ? 'AI is analyzing image...' : 'Converting PDF to image, then scanning...'}
                </p>
              </div>
            </div>
          </div>
        )}

        {extractedCount > 0 && !scanning && (
          <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm text-green-800 dark:text-green-200">
              ✓ Extracted {extractedCount} fields and saved as new profile!
            </p>
          </div>
        )}
      </div>

      {/* AI Notice */}
      {!settings.openAIEnabled && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            ⚠️ AI is required for document scanning. Please enable it in <strong>Privacy & Settings</strong> tab.
          </p>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
          📸 How to Use Document Scanner
        </h4>
        <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-2 list-decimal list-inside">
          <li>Take a clear, well-lit photo of your document</li>
          <li>Select the document type above</li>
          <li>Upload the image (AI will scan it automatically)</li>
          <li>Extracted data saves as a new profile in Data Management</li>
          <li>Review and edit the extracted fields if needed</li>
        </ol>
        
        <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700">
          <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-2">💡 Pro Tips:</p>
          <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 ml-4 list-disc">
            <li>Use good lighting - avoid glare and shadows</li>
            <li>Capture entire document in frame</li>
            <li>Higher resolution = better extraction accuracy</li>
            <li>Works with physical documents or digital images</li>
            <li><strong>PDF files:</strong> Automatically converted to images (first page scanned)</li>
            <li>AI Vision model: GPT-4o with OCR capabilities</li>
          </ul>
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div>
            <h4 className="font-semibold text-purple-900 dark:text-purple-100">Privacy & Security</h4>
            <ul className="mt-2 text-xs text-purple-800 dark:text-purple-200 space-y-1">
              <li>• Image sent to OpenAI for processing (you control this with your API key)</li>
              <li>• OpenAI processes image and returns text (doesn't store images per policy)</li>
              <li>• Extracted data saved locally on your device only</li>
              <li>• You can review and delete data anytime</li>
              <li>• Cost: ~$0.01-0.03 per document scan (GPT-4 Vision pricing)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Scanned Documents History */}
      <div className="bg-white dark:bg-gray-800 rounded-card shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Scanned Documents History
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {scannedProfiles.length} document{scannedProfiles.length !== 1 ? 's' : ''} scanned
            </p>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-4 py-2 text-sm font-medium text-primary-purple hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
          >
            {showHistory ? '▲ Hide' : '▼ Show'}
          </button>
        </div>

        {showHistory && (
          <div className="space-y-3">
            {scannedProfiles.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>No documents scanned yet</p>
                <p className="text-xs mt-1">Scan your first document above</p>
              </div>
            ) : (
              scannedProfiles.map((profile) => {
                const fieldCount = Object.keys(profile.data).length;
                const scanDate = new Date(profile.createdAt).toLocaleDateString();
                
                return (
                  <div
                    key={profile.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100">
                          {profile.name}
                        </h4>
                        <div className="mt-2 flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                          <span>{fieldCount} field{fieldCount !== 1 ? 's' : ''} extracted</span>
                          <span>•</span>
                          <span>Scanned {scanDate}</span>
                        </div>
                        {Object.keys(profile.data).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {Object.keys(profile.data).slice(0, 5).map((key) => (
                              <span
                                key={key}
                                className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300"
                              >
                                {key}
                              </span>
                            ))}
                            {Object.keys(profile.data).length > 5 && (
                              <span className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
                                +{Object.keys(profile.data).length - 5} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          // Switch to Data Management tab and highlight this profile
                          chrome.runtime.sendMessage({
                            type: 'OPEN_OPTIONS',
                            payload: { tab: 'data', highlightProfileId: profile.id }
                          });
                        }}
                        className="ml-4 px-3 py-1.5 text-sm font-medium text-primary-purple hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                      >
                        View Profile
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentScanner;

