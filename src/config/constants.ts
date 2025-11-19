/**
 * Configuration constants for FormBot
 */

// Lambda API endpoint (hardcoded - customers don't configure this)
export const LAMBDA_API_URL = 'https://it2kk01dc9.execute-api.us-east-1.amazonaws.com/Prod';

// Feature flags
export const FEATURES = {
  ENTERPRISE_SYNC: true,
  DOCUMENT_SCANNER: true,
  AI_MATCHING: true,
};

