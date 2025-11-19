// Core Types
export interface FormField {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  label: string;
  ariaLabel: string;
  value: string;
  xpath: string;
}

export interface DetectedField {
  field: FormField;
  fieldType: FieldType;
  confidence: number;
  matchedKey?: string;
}

export interface FormData {
  [key: string]: string;
}

export interface SavedFormData {
  id: string;
  name: string;
  data: FormData;
  secrets?: { [key: string]: string }; // Encrypted secrets for this profile
  createdAt: number;
  updatedAt: number;
}

export interface FormTemplate {
  id: string;
  name: string;
  urlPattern: string;
  linkedProfileId: string;
  fieldMappings: TemplateFieldMapping[];
  fieldStructure: string[]; // Field names/labels for similarity matching
  createdAt: number;
  updatedAt: number;
  usageCount: number;
}

export interface TemplateFieldMapping {
  fieldName: string;
  fieldLabel: string;
  dataKey: string;
  customValue?: string;
}

export interface FieldMapping {
  [key: string]: string[]; // e.g., "email": ["email", "e-mail", "contact-email", "user_email"]
}

export type FieldType = 
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'phone'
  | 'address'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'country'
  | 'company'
  | 'jobTitle'
  | 'website'
  | 'dateOfBirth'
  | 'gender'
  | 'password'
  | 'username'
  | 'cardNumber'
  | 'cardExpiry'
  | 'cardCVV'
  | 'passportNumber'
  | 'licenseNumber'
  | 'idNumber'
  | 'unknown';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface Settings {
  autoFillEnabled: boolean;
  openAIEnabled: boolean;
  openAIKey: string;
  minConfidence: number;
  highlightFields: boolean;
  darkMode: boolean;
  masterProfile: string;
  linkedInUrl: string;
  enterpriseMode: boolean;
  zapierWebhookUrl: string;
  sendToZapierOnSubmit: boolean;
  autoSyncEnabled: boolean;
}

export interface ExtractedProfileData {
  // Standard fields
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  company?: string;
  jobTitle?: string;
  website?: string;
  linkedIn?: string;
  github?: string;
  
  // Rich content fields
  skills?: string;
  experience?: string;
  education?: string;
  summary?: string;
  
  // Custom/Extended fields (AI will extract anything it finds)
  personalProjects?: string;
  projects?: string;
  certifications?: string;
  languages?: string;
  awards?: string;
  publications?: string;
  portfolio?: string;
  hobbies?: string;
  interests?: string;
  volunteerWork?: string;
  references?: string;
  objectives?: string;
  achievements?: string;
  licenses?: string;
  patents?: string;
  conferences?: string;
  speakingEngagements?: string;
  professionalMemberships?: string;
  
  // Catch-all for any other fields AI extracts
  [key: string]: string | undefined;
}

export interface Message {
  type: MessageType;
  payload?: any;
}

export type MessageType =
  | 'FORM_DETECTED'
  | 'FILL_FORM'
  | 'FILL_SINGLE_FIELD'
  | 'FILL_FROM_RESUME'
  | 'GET_FORM_DATA'
  | 'REMATCH_FIELDS'
  | 'SAVE_FORM_DATA'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'HIGHLIGHT_FIELD'
  | 'UNDO_FILL'
  | 'GET_FILL_STATUS'
  | 'SAVE_TEMPLATE'
  | 'APPLY_TEMPLATE'
  | 'EXTRACT_FILLED_DATA';

export interface FormDetectionResult {
  fields: DetectedField[];
  formCount: number;
  url: string;
}

// OpenAI Integration
export interface AIMatchRequest {
  fieldName: string;
  fieldType: string;
  placeholder: string;
  label: string;
  availableKeys: string[];
}

export interface AIMatchResponse {
  matchedKey: string;
  confidence: number;
}

