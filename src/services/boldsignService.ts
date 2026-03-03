import { BACKEND_URL } from '../config/api';

export interface BoldSignSigner {
  name: string;
  email: string;
  signerOrder: number;
}

export interface SendForESignParams {
  agreementBlob: Blob;
  fileName: string;
  title: string;
  message: string;
  company?: string;
  clientName?: string;
  clientEmail?: string;
  quoteId?: string;
  signers: BoldSignSigner[];
}

class BoldSignService {
  async sendDocumentForESign(params: SendForESignParams): Promise<any> {
    const formData = new FormData();
    formData.append('attachment', params.agreementBlob, params.fileName);
    formData.append('title', params.title);
    formData.append('message', params.message);
    formData.append('company', params.company || '');
    formData.append('clientName', params.clientName || '');
    formData.append('clientEmail', params.clientEmail || '');
    formData.append('quoteId', params.quoteId || '');
    formData.append('signers', JSON.stringify(params.signers || []));

    const response = await fetch(`${BACKEND_URL}/api/boldsign/send-document`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    if (!response.ok || !result?.success) {
      throw new Error(result?.message || result?.error || `Failed to send for eSign (${response.status})`);
    }
    return result;
  }

  async getDocumentStatus(boldsignDocumentId: string): Promise<any> {
    const response = await fetch(`${BACKEND_URL}/api/boldsign/documents/${encodeURIComponent(boldsignDocumentId)}/status`);
    const result = await response.json();
    if (!response.ok || !result?.success) {
      throw new Error(result?.message || result?.error || `Failed to fetch eSign status (${response.status})`);
    }
    return result;
  }

  getSignedDocumentDownloadUrl(boldsignDocumentId: string): string {
    return `${BACKEND_URL}/api/boldsign/documents/${encodeURIComponent(boldsignDocumentId)}/signed`;
  }
}

export const boldSignService = new BoldSignService();

