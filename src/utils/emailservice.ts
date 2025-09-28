// EmailJS Configuration
// Replace these with your actual EmailJS credentials
const EMAILJS_SERVICE_ID = 'service_xz8sqc4';
const EMAILJS_TEMPLATE_ID = 'template_er8nbca';
const EMAILJS_PUBLIC_KEY = '1Fn5JK8p6jMWtMYgL';

// EmailJS function to send emails
export async function sendEmailWithEmailJS(
  to: string,
  subject: string,
  message: string,
  _attachment?: Blob,
  _attachmentName?: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Load EmailJS script dynamically
    if (!window.emailjs) {
      await loadEmailJSScript();
    }

    // Prepare template parameters
    const templateParams = {
      to_email: to,
      subject: subject,
      message: message,
      from_name: 'CPQ System',
      reply_to: 'saitharunreddy2302@gmail.com'
    };

    console.log('📧 Sending email via EmailJS:', {
      to,
      subject,
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

    console.log('✅ EmailJS email sent successfully:', result);
    return { success: true, message: 'Email sent successfully!' };

  } catch (error: any) {
    console.error('❌ EmailJS error:', error);
    return { 
      success: false, 
      message: `Email failed: ${error.message}` 
    };
  }
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
