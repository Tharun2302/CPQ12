/**
 * Document Service - Handles saving and retrieving PDF documents
 * Uses IndexedDB for client-side storage
 */

export interface SavedDocument {
  id: string;
  fileName: string;
  fileData: string; // base64 encoded PDF
  fileSize: number;
  clientName: string;
  clientEmail: string;
  company: string;
  templateName: string;
  generatedDate: Date;
  quoteId?: string;
  metadata?: {
    totalCost?: number;
    duration?: number;
    migrationType?: string;
    numberOfUsers?: number;
  };
}

class DocumentService {
  private dbName = 'CPQ_Documents';
  private storeName = 'documents';
  private db: IDBDatabase | null = null;

  /**
   * Initialize IndexedDB
   */
  async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        console.error('❌ Error opening IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB opened successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
          objectStore.createIndex('clientName', 'clientName', { unique: false });
          objectStore.createIndex('generatedDate', 'generatedDate', { unique: false });
          objectStore.createIndex('company', 'company', { unique: false });
          console.log('✅ Object store created');
        }
      };
    });
  }

  /**
   * Save a PDF document to the database
   */
  async saveDocument(document: SavedDocument): Promise<void> {
    try {
      const db = await this.initDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const objectStore = transaction.objectStore(this.storeName);
        
        const request = objectStore.add(document);
        
        request.onsuccess = () => {
          console.log('✅ Document saved successfully:', document.id);
          resolve();
        };
        
        request.onerror = () => {
          console.error('❌ Error saving document:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('❌ Error in saveDocument:', error);
      throw error;
    }
  }

  /**
   * Get all saved documents
   */
  async getAllDocuments(): Promise<SavedDocument[]> {
    try {
      const db = await this.initDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const objectStore = transaction.objectStore(this.storeName);
        
        const request = objectStore.getAll();
        
        request.onsuccess = () => {
          const documents = request.result as SavedDocument[];
          // Sort by date (newest first)
          documents.sort((a, b) => new Date(b.generatedDate).getTime() - new Date(a.generatedDate).getTime());
          console.log('✅ Retrieved documents:', documents.length);
          resolve(documents);
        };
        
        request.onerror = () => {
          console.error('❌ Error getting documents:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('❌ Error in getAllDocuments:', error);
      return [];
    }
  }

  /**
   * Get a specific document by ID
   */
  async getDocument(id: string): Promise<SavedDocument | null> {
    try {
      const db = await this.initDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const objectStore = transaction.objectStore(this.storeName);
        
        const request = objectStore.get(id);
        
        request.onsuccess = () => {
          resolve(request.result || null);
        };
        
        request.onerror = () => {
          console.error('❌ Error getting document:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('❌ Error in getDocument:', error);
      return null;
    }
  }

  /**
   * Delete a document by ID
   */
  async deleteDocument(id: string): Promise<void> {
    try {
      const db = await this.initDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const objectStore = transaction.objectStore(this.storeName);
        
        const request = objectStore.delete(id);
        
        request.onsuccess = () => {
          console.log('✅ Document deleted successfully:', id);
          resolve();
        };
        
        request.onerror = () => {
          console.error('❌ Error deleting document:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('❌ Error in deleteDocument:', error);
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
   * Generate unique ID for document
   */
  generateDocumentId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const documentService = new DocumentService();
