/**
 * AI-Powered Document Scanner using GPT-4 Vision
 */

import { ExtractedProfileData } from '../types';
import { getSettings } from './storage';

/**
 * Extract data from document image using AI Vision
 */
export async function extractFromDocumentImage(
  imageFile: File,
  documentType: 'drivers_license' | 'passport' | 'id_card' | 'insurance' | 'other'
): Promise<ExtractedProfileData | null> {
  const settings = await getSettings();
  
  if (!settings.openAIEnabled || !settings.openAIKey) {
    throw new Error('AI must be enabled to scan documents');
  }

  try {
    let base64Image: string;
    
    // Handle PDFs - convert to image first
    if (isPDF(imageFile)) {
      console.log('📄 PDF detected, converting to image...');
      base64Image = await pdfToImage(imageFile);
      console.log('✓ PDF converted to image');
    } else {
      console.log('📸 Converting image file to base64...');
      base64Image = await fileToBase64(imageFile);
      console.log('✓ Base64 conversion complete, length:', base64Image.length);
    }
    
    // Determine extraction instructions based on document type
    const instructions = getExtractionInstructions(documentType);
    
    const systemPrompt = `You are an expert at extracting structured data from identity documents and official forms.

Extract ALL readable information from the document image.

Common fields:
- Personal: firstName, lastName, fullName, dateOfBirth, age, gender, address, city, state, zipCode, country
- ID-specific: idNumber, licenseNumber, passportNumber, expirationDate, issueDate, nationality
- Contact: email, phone
- Physical: height, weight, eyeColor, hairColor
- Additional: Any other visible information

Return ONLY valid JSON with all extracted fields.`;

    const userPrompt = `Analyze this ${documentType.replace('_', ' ')} image and extract ALL visible information.

${instructions}

Return comprehensive JSON with all fields you can read:
{
  "firstName": "...",
  "lastName": "...",
  "dateOfBirth": "...",
  "address": "...",
  "licenseNumber": "...",
  ...any other field you find...
}

Extract everything visible and readable.`;

    console.log('🌐 Sending request to OpenAI API...');
    console.log('📊 Model: gpt-4o (Vision)');
    console.log('🔧 Max tokens: 2000');
    
    const requestBody = {
      model: 'gpt-4o', // GPT-4 with vision
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: {
                url: base64Image,
                detail: 'high', // High detail for better OCR
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    };
    
    console.log('📤 Request prepared, calling API...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.openAIKey}`,
      },
      body: JSON.stringify(requestBody),
    });
    
    console.log('📥 Response received, status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 401) {
        throw new Error('Invalid API key');
      } else if (response.status === 402) {
        throw new Error('Insufficient credits');
      } else {
        throw new Error(`OpenAI API failed: ${errorData.error?.message || response.statusText}`);
      }
    }

    const data = await response.json();
    console.log('📊 API Response data:', data);
    
    const content = data.choices[0]?.message?.content;
    console.log('💬 AI Message content length:', content?.length || 0);

    if (!content) {
      console.error('❌ No content in response');
      throw new Error('No response from AI');
    }

    console.log('📝 Parsing extracted data...');
    const extracted = JSON.parse(content) as ExtractedProfileData;
    console.log('✅ Extracted fields:', Object.keys(extracted));
    console.log('📦 Full extracted data:', extracted);
    
    return extracted;
  } catch (error) {
    console.error('❌ Document scan failed:', error);
    throw error;
  }
}

/**
 * Convert file to base64 data URL
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Get extraction instructions for document type
 */
function getExtractionInstructions(documentType: string): string {
  const instructions: { [key: string]: string } = {
    drivers_license: `
      Focus on: Name, date of birth, address, license number, expiration date, 
      issue date, height, weight, eye color, hair color, restrictions, endorsements.
    `,
    passport: `
      Focus on: Full name, passport number, nationality, date of birth, 
      place of birth, issue date, expiration date, gender, passport type.
    `,
    id_card: `
      Focus on: Name, ID number, date of birth, address, issue date, 
      expiration date, photo details, nationality.
    `,
    insurance: `
      Focus on: Policy holder name, policy number, group number, member ID,
      effective date, coverage details, provider name, phone numbers.
    `,
    other: `
      Extract any and all visible text, names, numbers, dates, and identifiable information.
    `,
  };

  return instructions[documentType] || instructions.other;
}

/**
 * Validate document file (images and PDFs)
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Check file type - images and PDFs
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Please upload JPG, PNG, WebP, or PDF files.',
    };
  }

  // Check file size (max 20MB for Vision API)
  const maxSize = 20 * 1024 * 1024; // 20MB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'File too large. Maximum size is 20MB.',
    };
  }

  return { valid: true };
}

/**
 * Convert PDF first page to image
 */
async function pdfToImage(file: File): Promise<string> {
  console.log('📄 Converting PDF to image...');
  
  // Dynamic import to keep bundle size down
  const pdfjsLib = await import('pdfjs-dist');
  
  // Set worker path to bundled local file
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js');
  
  // Read file as array buffer
  const arrayBuffer = await file.arrayBuffer();
  
  // Load PDF
  console.log('📖 Loading PDF...');
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  console.log('✓ PDF loaded, pages:', pdf.numPages);
  
  // Get first page
  const page = await pdf.getPage(1);
  console.log('✓ Got first page');
  
  // Set scale for good quality
  const scale = 2.0;
  const viewport = page.getViewport({ scale });
  
  // Create canvas
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to get canvas context');
  }
  
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  
  // Render PDF page to canvas
  console.log('🎨 Rendering PDF to canvas...');
  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;
  
  console.log('✓ PDF rendered to canvas');
  
  // Convert canvas to base64 image
  const imageData = canvas.toDataURL('image/png');
  console.log('✓ Converted to PNG, size:', (imageData.length / 1024).toFixed(1) + 'KB');
  
  return imageData;
}

/**
 * Check if file is PDF
 */
export function isPDF(file: File): boolean {
  return file.type === 'application/pdf';
}

