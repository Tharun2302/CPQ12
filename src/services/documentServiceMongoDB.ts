/**
 * Document Service - MongoDB Backend Version
 * Saves PDFs to MongoDB via API endpoints
 */

export type DealDocumentsApprovalFilter = 'all' | 'in_workflow' | 'no_workflow';

export interface SavedDocument {
  id: string;
  fileName: string;
  fileData: string; // base64 encoded PDF
  fileSize: number;
  docxFileData?: string; // base64 encoded DOCX (optional, for Word downloads)
  docxFileName?: string; // DOCX filename (optional)
  clientName: string;
  clientEmail?: string;
  company: string;
  templateName?: string;
  generatedDate: string;
  createdAt?: string;
  status?: string;
  quoteId?: string;
  metadata?: {
    totalCost?: number;
    duration?: number;
    migrationType?: string;
    numberOfUsers?: number;
  };
}

class DocumentServiceMongoDB {
  // Match the same backend resolution strategy as templateService
  private baseUrl: string = (() => {
    const envUrl = (import.meta as any)?.env?.VITE_BACKEND_URL as string | undefined;
    if (envUrl && envUrl.trim() !== '') return `${envUrl}/api`;
    // Dev: Vite runs on 5173 and backend typically on 3001
    if (typeof window !== 'undefined' && window.location.origin.includes('localhost:5173')) {
      return 'http://localhost:3001/api';
    }
    // Prod: same origin
    return '/api';
  })();
  private apiUrl = `${this.baseUrl}/documents`;

  /**
   * Save a PDF document to MongoDB
   */
  async saveDocument(document: Omit<SavedDocument, 'id'>): Promise<string> {
    try {
      console.log('💾 Saving document to MongoDB...');
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(document),
      });

      if (!response.ok) {
        let details = '';
        try { details = await response.text(); } catch {}
        throw new Error(`HTTP error! status: ${response.status}${details ? ` - ${details}` : ''}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to save document');
      }

      console.log('✅ Document saved to MongoDB successfully:', data.documentId);
      return data.documentId;
    } catch (error) {
      console.error('❌ Error saving document to MongoDB:', error);
      throw error;
    }
  }

  /**
   * Get saved documents from MongoDB (metadata only). Requests the full list (`all=1`) for the Deal Documents UI.
   */
  async getAllDocuments(
    approvalFilter: DealDocumentsApprovalFilter = 'all'
  ): Promise<{ documents: SavedDocument[]; totalCount: number; approvalFilter: DealDocumentsApprovalFilter }> {
    try {
      console.log('📥 Fetching documents from MongoDB...');

      const controller = new AbortController();
      const timeoutMs = 120000; // large libraries: long JSON payload
      const timeoutId = setTimeout(() => {
        console.warn(`⚠️ /api/documents request exceeded ${timeoutMs}ms, aborting`);
        controller.abort();
      }, timeoutMs);

      const params = new URLSearchParams();
      params.set('all', '1'); // ensure full list (server defaults to unlimited for this route; belt-and-suspenders)
      if (approvalFilter && approvalFilter !== 'all') {
        params.set('approvalFilter', approvalFilter);
      }
      const url = `${this.apiUrl}?${params.toString()}`;

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        let details = '';
        try { details = await response.text(); } catch {}
        throw new Error(`HTTP error! status: ${response.status}${details ? ` - ${details}` : ''}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch documents');
      }

      const totalCount =
        typeof data.totalCount === 'number' ? data.totalCount : (data.documents?.length ?? 0);

      const resolvedFilter: DealDocumentsApprovalFilter =
        data.approvalFilter === 'in_workflow' || data.approvalFilter === 'no_workflow'
          ? data.approvalFilter
          : approvalFilter;

      console.log('✅ Retrieved documents from MongoDB:', data.documents.length, '/', totalCount, 'total');
      return { documents: data.documents, totalCount, approvalFilter: resolvedFilter };
    } catch (error) {
      console.error('❌ Error fetching documents from MongoDB:', error);
      throw error;
    }
  }

  /**
   * Get a specific document by ID from MongoDB
   */
  async getDocument(id: string): Promise<SavedDocument | null> {
    try {
      console.log('📥 Fetching document from MongoDB:', id);
      
      const response = await fetch(`${this.apiUrl}/${id}`);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        let details = '';
        try { details = await response.text(); } catch {}
        throw new Error(`HTTP error! status: ${response.status}${details ? ` - ${details}` : ''}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch document');
      }

      console.log('✅ Retrieved document from MongoDB:', id);
      return data.document;
    } catch (error) {
      console.error('❌ Error fetching document from MongoDB:', error);
      return null;
    }
  }

  /**
   * Delete a document by ID from MongoDB
   */
  async deleteDocument(id: string): Promise<void> {
    try {
      console.log('🗑️ Deleting document from MongoDB:', id);
      
      const response = await fetch(`${this.apiUrl}/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        let details = '';
        try { details = await response.text(); } catch {}
        throw new Error(`HTTP error! status: ${response.status}${details ? ` - ${details}` : ''}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to delete document');
      }

      console.log('✅ Document deleted from MongoDB successfully:', id);
    } catch (error) {
      console.error('❌ Error deleting document from MongoDB:', error);
      throw error;
    }
  }

  /**
   * Convert Blob to base64 string
   */
  async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]); // Remove data:application/pdf;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Convert base64 string to Blob
   */
  base64ToBlob(base64: string, type: string = 'application/pdf'): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type });
  }

  /**
   * Generate unique ID for document with client and company names
   */
  generateDocumentId(clientName?: string, company?: string): string {
    const sanitizeForId = (str: string) => {
      if (!str) return 'Unknown';
      return str
        .replace(/[^a-zA-Z0-9]/g, '') // Remove special characters
        .substring(0, 20) // Limit length
        .replace(/^[0-9]/, 'C$&'); // Ensure doesn't start with number
    };
    
    const sanitizedCompany = sanitizeForId(company || 'UnknownCompany');
    const sanitizedClient = sanitizeForId(clientName || 'UnknownClient');
    const timestamp = Date.now().toString().slice(-5); // Keep only last 5 digits
    
    return `${sanitizedCompany}_${sanitizedClient}_${timestamp}`;
  }
}

// Export singleton instance
export const documentServiceMongoDB = new DocumentServiceMongoDB();
