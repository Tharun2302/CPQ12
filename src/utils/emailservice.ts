// EmailJS Configuration
// Replace these with your actual EmailJS credentials
const EMAILJS_SERVICE_ID = 'service_xz8sqc4';
const EMAILJS_TEMPLATE_ID = 'template_er8nbca';
const EMAILJS_PUBLIC_KEY = '1Fn5JK8p6jMWtMYgL';

// EmailJS function to send emails with Word file attachment
export async function sendEmailWithEmailJS(
  to: string,
  subject: string,
  message: string,
  attachment?: Blob,
  attachmentName?: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Load EmailJS script dynamically
    if (!window.emailjs) {
      await loadEmailJSScript();
    }

    // Prepare template parameters
    const templateParams: any = {
      to_email: to,
      subject: subject,
      message: message,
      from_name: 'ZENOP System',
      reply_to: 'saitharunreddy2302@gmail.com',
      attachment_name: attachmentName || 'Agreement.docx'
    };

    // Add attachment if provided
    if (attachment && attachmentName) {
      console.log('📎 Processing attachment:', attachmentName);
      
      // Convert blob to base64 for EmailJS
      const base64 = await blobToBase64(attachment);
      
      // Add attachment data to template parameters (EmailJS expects specific parameter names)
      templateParams.agreement_file = base64;
      templateParams.attachment_name = attachmentName;
      
      console.log('📎 Attachment converted to base64, size:', base64.length);
      console.log('📎 Attachment parameter added:', { agreement_file: base64.substring(0, 50) + '...' });
    }

    console.log('📧 Sending email via EmailJS with attachment:', {
      to,
      subject,
      attachmentName: attachmentName || 'No attachment',
      hasAttachment: !!(attachment && attachmentName),
      serviceId: EMAILJS_SERVICE_ID,
      templateId: EMAILJS_TEMPLATE_ID
    });

    // Send email using EmailJS
    const result = await window.emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      templateParams,
      EMAILJS_PUBLIC_KEY
    );

    console.log('✅ EmailJS email sent successfully with attachment:', result);
    return { success: true, message: 'Email sent successfully with attachment!' };

  } catch (error: any) {
    console.error('❌ EmailJS error:', error);
    return { 
      success: false, 
      message: `Email failed: ${error.message}` 
    };
  }
}

// Convert Blob to Base64 for EmailJS attachment
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix to get just the base64 string
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = () => reject(new Error('Failed to convert blob to base64'));
    reader.readAsDataURL(blob);
  });
}

// Load EmailJS script dynamically
function loadEmailJSScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.emailjs) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    script.onload = () => {
      window.emailjs.init(EMAILJS_PUBLIC_KEY);
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load EmailJS script'));
    document.head.appendChild(script);
  });
}

// Declare EmailJS types
declare global {
  interface Window {
    emailjs: any;
  }
}
