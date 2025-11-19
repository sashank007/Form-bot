/**
 * Zapier Integration (No Backend Required)
 * Sends form data directly to Zapier webhooks
 */

import { getSettings } from './storage';

/**
 * Send form data to Zapier webhook
 */
export async function sendToZapier(formData: { [key: string]: any }): Promise<boolean> {
  console.log('━━━━━ ZAPIER SEND FUNCTION CALLED ━━━━━');
  
  const settings = await getSettings();
  
  console.log('Zapier config check:', {
    enterpriseMode: settings.enterpriseMode,
    hasWebhookUrl: !!settings.zapierWebhookUrl,
    webhookUrl: settings.zapierWebhookUrl,
  });
  
  if (!settings.enterpriseMode || !settings.zapierWebhookUrl) {
    console.log('❌ Zapier: Not configured or enterprise mode disabled');
    return false;
  }

  try {
    console.log('📤 Preparing to send data to Zapier webhook...');
    console.log('🔗 Webhook URL:', settings.zapierWebhookUrl);
    console.log('📊 Form Data to send:', formData);
    console.log('📦 Number of fields:', Object.keys(formData).length);
    
    const payload = {
      timestamp: new Date().toISOString(),
      source: 'FormBot Extension',
      url: window.location.href,
      fields: formData,
    };
    
    console.log('📦 Complete payload:', payload);
    console.log('🌐 Sending POST request...');

    const response = await fetch(settings.zapierWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('📥 Response received!');
    console.log('  Status:', response.status);
    console.log('  Status Text:', response.statusText);
    console.log('  OK:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Webhook error response:', errorText);
      throw new Error(`Webhook failed: ${response.status} - ${errorText}`);
    }

    const responseData = await response.text();
    console.log('✅ Zapier response data:', responseData);
    console.log('✅✅✅ Data sent to Zapier successfully!');
    
    return true;
  } catch (error) {
    console.error('❌❌❌ Failed to send to Zapier:', error);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack',
    });
    return false;
  }
}

/**
 * Extract filled form data from page
 */
export function extractFilledFormData(): { [key: string]: string } {
  console.log('📋 Extracting filled form data from page...');
  
  const formData: { [key: string]: string } = {};
  
  // Get all forms
  const forms = document.querySelectorAll('form');
  console.log('📄 Found', forms.length, 'form(s) on page');
  
  forms.forEach((form, index) => {
    console.log(`  Processing form ${index + 1}...`);
    const formDataObj = new FormData(form);
    
    let fieldCount = 0;
    formDataObj.forEach((value, key) => {
      if (value && String(value).trim()) {
        formData[key] = String(value);
        fieldCount++;
        console.log(`    ✓ ${key}: ${String(value).substring(0, 50)}${String(value).length > 50 ? '...' : ''}`);
      }
    });
    console.log(`  Extracted ${fieldCount} fields from form ${index + 1}`);
  });
  
  // Also get contenteditable fields
  const contentEditables = document.querySelectorAll('[contenteditable="true"]');
  console.log('📝 Found', contentEditables.length, 'contenteditable field(s)');
  
  contentEditables.forEach(el => {
    const text = (el as HTMLElement).textContent?.trim();
    if (text) {
      const label = (el as HTMLElement).getAttribute('aria-label') || 'field';
      formData[label] = text;
      console.log(`  ✓ ${label}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
    }
  });
  
  console.log('📦 Total extracted fields:', Object.keys(formData).length);
  console.log('📦 Complete data:', formData);
  
  return formData;
}

/**
 * Test webhook connection
 */
export async function testZapierWebhook(webhookUrl: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        test: true,
        message: 'FormBot webhook test',
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Webhook returned ${response.status}: ${response.statusText}`,
      };
    }

    return {
      success: true,
      message: 'Webhook connected successfully! ✓',
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

