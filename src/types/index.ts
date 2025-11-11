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
  createdAt: number;
  updatedAt: number;
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
}

export interface ExtractedProfileData {
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
  skills?: string;
  experience?: string;
  education?: string;
  summary?: string;
  [key: string]: string | undefined;
}

export interface Message {
  type: MessageType;
  payload?: any;
}

export type MessageType =
  | 'FORM_DETECTED'
  | 'FILL_FORM'
  | 'FILL_FROM_RESUME'
  | 'GET_FORM_DATA'
  | 'SAVE_FORM_DATA'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'HIGHLIGHT_FIELD'
  | 'UNDO_FILL';

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

