/**
 * BoldSign Integration Service
 * Handles document signing workflow using BoldSign API
 */

export interface BoldSignSigner {
  name: string;
  emailAddress: string;
  signerOrder: number;
  signerRole: string;
  formFields?: BoldSignFormField[];
}

export interface BoldSignFormField {
  id: string;
  name: string;
  fieldType: 'Signature' | 'TextBox' | 'DateSigned' | 'CheckBox' | 'RadioButton' | 'Dropdown';
  pageNumber: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isRequired: boolean;
  value?: string;
  placeholder?: string;
  signerId?: string;
}

export interface BoldSignDocumentRequest {
  title: string;
  message: string;
  files: {
    fileData: string; // base64
    fileName: string;
  }[];
  signers: BoldSignSigner[];
  enableSigningOrder: boolean;
  hideDocumentId?: boolean;
  autoReminders?: boolean;
  reminderDays?: number;
}

export interface BoldSignDocumentResponse {
  documentId: string;
  signers: {
    signerEmail: string;
    signUrl: string;
    signerId: string;
  }[];
  message: string;
}

class BoldSignService {
  private apiKey: string;
  private apiUrl: string;

  constructor() {
    // API key will be loaded from server environment
    this.apiKey = '';
    // BoldSign API URL from environment variable, with fallback to default
    this.apiUrl = import.meta.env.VITE_BOLDSIGN_API_URL || 'https://api.boldsign.com';
  }

  /**
   * Send document to BoldSign for signatures
   */
  async sendDocumentForSignature(
    documentBase64: string,
    fileName: string,
    legalTeamEmail: string,
    clientEmail: string,
    documentTitle: string,
    clientName: string
  ): Promise<BoldSignDocumentResponse> {
    const API_URL = '/api/boldsign/send-document';

    try {
      console.log('📤 Sending document to BoldSign...');
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentBase64,
          fileName,
          legalTeamEmail,
          clientEmail,
          documentTitle,
          clientName
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send document to BoldSign');
      }

      const result = await response.json();
      console.log('✅ Document sent to BoldSign successfully:', result);
      
      return result;
    } catch (error) {
      console.error('❌ Error sending document to BoldSign:', error);
      throw error;
    }
  }

  /**
   * Create form fields for page 3 of the document
   */
  createPage3FormFields(signerId: string): BoldSignFormField[] {
    return [
      {
        id: `signature_${signerId}`,
        name: 'By',
        fieldType: 'Signature',
        pageNumber: 3,
        // Move down to align signature box on the "By:" underline
        bounds: { x: 120, y: 270, width: 180, height: 30 },
        isRequired: true,
        signerId,
        value: '', // Explicitly set empty value
        placeholder: '' // Explicitly set empty placeholder
      },
      {
        id: `name_${signerId}`,
        name: 'Name',
        fieldType: 'TextBox',
        pageNumber: 3,
        // Move down to sit on the underline
        bounds: { x: 120, y: 320, width: 180, height: 25 },
        isRequired: true,
        placeholder: '',
        value: '',
        signerId
      },
      {
        id: `title_${signerId}`,
        name: 'Title',
        fieldType: 'TextBox',
        pageNumber: 3,
        // Move down to sit on the underline
        bounds: { x: 120, y: 370, width: 180, height: 25 },
        isRequired: true,
        placeholder: '',
        value: '',
        signerId
      },
      {
        id: `date_${signerId}`,
        name: 'Date',
        fieldType: 'DateSigned',
        pageNumber: 3,
        // Move up slightly to sit above the underline like other fields
        bounds: { x: 120, y: 410, width: 180, height: 25 },
        isRequired: true,
        signerId,
        value: '', // Explicitly set empty value
        placeholder: 'DD/MM/YYYY', // Add helpful placeholder for date format
        dateFormat: 'DD/MM/YYYY' // Specify date format for calendar picker
      }
    ];
  }

  /**
   * Check document status
   */
  async checkDocumentStatus(documentId: string): Promise<any> {
    const API_URL = `/api/boldsign/document-status/${documentId}`;

    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        throw new Error('Failed to check document status');
      }

      return await response.json();
    } catch (error) {
      console.error('❌ Error checking document status:', error);
      throw error;
    }
  }
}

export const boldSignService = new BoldSignService();

