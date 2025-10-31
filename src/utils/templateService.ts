// Template Service for Database Operations
export interface DatabaseTemplate {
  id: string;
  name: string;
  description?: string;
  fileName: string;
  fileType: 'pdf' | 'docx';
  fileSize: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateUploadResponse {
  success: boolean;
  message: string;
  template: DatabaseTemplate;
}

export interface TemplatesResponse {
  success: boolean;
  templates: DatabaseTemplate[];
  count: number;
}

class TemplateService {
  private baseUrl = import.meta.env.VITE_BACKEND_URL ? `${import.meta.env.VITE_BACKEND_URL}/api` : 'http://localhost:3001/api';

  // Upload template to database
  async uploadTemplate(file: File, name?: string, description?: string, isDefault: boolean = false): Promise<TemplateUploadResponse> {
    try {
      console.log('📄 Uploading template to database:', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        name,
        description,
        isDefault
      });

      const formData = new FormData();
      formData.append('template', file);
      if (name) formData.append('name', name);
      if (description) formData.append('description', description);
      formData.append('isDefault', isDefault.toString());

      const response = await fetch(`${this.baseUrl}/templates`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        // Check if it's a server error (HTML response)
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
          throw new Error('Server is not responding correctly. Please check if the server is running.');
        }
        
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload template');
      }

      const result = await response.json();
      console.log('✅ Template uploaded successfully:', result.template.id);
      return result;

    } catch (error) {
      console.error('❌ Error uploading template:', error);
      throw error;
    }
  }

  // Get all templates from database
  async getTemplates(): Promise<DatabaseTemplate[]> {
    try {
      console.log('📄 Fetching templates from database...');

      const response = await fetch(`${this.baseUrl}/templates`);
      
      if (!response.ok) {
        // Check if it's a server error (HTML response)
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
          throw new Error('Server is not responding correctly. Please check if the server is running.');
        }
        
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch templates');
      }

      const result: TemplatesResponse = await response.json();
      console.log(`✅ Fetched ${result.templates.length} templates from database`);
      return result.templates;

    } catch (error) {
      console.error('❌ Error fetching templates:', error);
      throw error;
    }
  }

  // Get template file from database
  async getTemplateFile(templateId: string): Promise<File> {
    try {
      console.log('📄 Fetching template file:', templateId);

      const response = await fetch(`${this.baseUrl}/templates/${templateId}/file`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch template file');
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileName = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') 
        : `template-${templateId}`;

      const blob = await response.blob();
      
      // Validate blob
      if (blob.size === 0) {
        throw new Error('Template file is empty');
      }
      
      // Ensure correct MIME type for DOCX files
      let mimeType = blob.type;
      if (fileName.toLowerCase().endsWith('.docx') && !mimeType.includes('wordprocessingml')) {
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
      
      const file = new File([blob], fileName, { type: mimeType });
      
      console.log('✅ Template file fetched:', fileName, 'Size:', file.size, 'bytes', 'Type:', file.type);
      return file;

    } catch (error) {
      console.error('❌ Error fetching template file:', error);
      throw error;
    }
  }

  // Convert DOCX blob to PDF via backend
  async convertDocxToPdf(file: Blob): Promise<Blob> {
    const form = new FormData();
    form.append('file', file, 'agreement.docx');
    const response = await fetch(`${this.baseUrl}/convert/docx-to-pdf`, {
      method: 'POST',
      body: form
    });
    if (!response.ok) {
      const msg = await response.text().catch(() => 'Conversion failed');
      throw new Error(msg || 'Conversion failed');
    }
    
    // Check if response is HTML (fallback mode)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      // Server returned HTML, convert it to PDF on client side
      const html = await response.text();
      return await this.convertHtmlToPdf(html);
    }
    
    return await response.blob();
  }

  // Convert HTML to PDF using jsPDF
  private async convertHtmlToPdf(html: string): Promise<Blob> {
    console.log('🔄 Converting HTML to PDF...');
    console.log('📄 HTML content length:', html.length);
    
    // Create a temporary div to render the HTML
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '0';
    tempDiv.style.width = '1200px';
    tempDiv.style.backgroundColor = 'white';
    tempDiv.style.padding = '40px';
    tempDiv.style.fontFamily = 'Arial, sans-serif';
    tempDiv.style.lineHeight = '1.6';
    tempDiv.style.color = '#333';
    document.body.appendChild(tempDiv);
    
    try {
      // Extract body content from HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const bodyContent = doc.body.innerHTML;
      
      console.log('📄 Extracted body content length:', bodyContent.length);
      
      // Set the content
      tempDiv.innerHTML = bodyContent;
      
      // Wait for content to render
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log('📄 Temp div height:', tempDiv.scrollHeight);
      
      // Use html2canvas to capture the content
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 1200,
        height: tempDiv.scrollHeight,
        logging: true
      });
      
      console.log('📄 Canvas created, dimensions:', canvas.width, 'x', canvas.height);
      
      // Convert to PDF using jsPDF
      const jsPDF = (await import('jspdf')).default;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      
      // Check if image data is valid
      if (!imgData || imgData === 'data:,') {
        throw new Error('Canvas capture failed - no image data generated');
      }
      
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 295; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      
      console.log('📄 Adding image to PDF, dimensions:', imgWidth, 'x', imgHeight);
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      // Convert to blob
      const pdfBlob = pdf.output('blob');
      console.log('✅ PDF generated successfully, size:', pdfBlob.size, 'bytes');
      return pdfBlob;
      
    } finally {
      // Cleanup
      document.body.removeChild(tempDiv);
    }
  }

  // Delete template from database
  async deleteTemplate(templateId: string): Promise<void> {
    try {
      console.log('🗑️ Deleting template:', templateId);

      const response = await fetch(`${this.baseUrl}/templates/${templateId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete template');
      }

      console.log('✅ Template deleted successfully:', templateId);

    } catch (error) {
      console.error('❌ Error deleting template:', error);
      throw error;
    }
  }

  // Update template metadata
  async updateTemplate(templateId: string, updates: { name?: string; description?: string; isDefault?: boolean }): Promise<void> {
    try {
      console.log('📝 Updating template metadata:', templateId, updates);

      const response = await fetch(`${this.baseUrl}/templates/${templateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update template');
      }

      console.log('✅ Template updated successfully:', templateId);

    } catch (error) {
      console.error('❌ Error updating template:', error);
      throw error;
    }
  }

  // Convert database template to frontend template format (WITH LAZY FILE LOADING)
  async convertToFrontendTemplate(dbTemplate: DatabaseTemplate): Promise<any> {
    try {
      // OPTIMIZATION: Don't fetch the file immediately - create a lazy loader
      return {
        id: dbTemplate.id,
        name: dbTemplate.name,
        description: dbTemplate.description,
        file: null, // File not loaded yet - will load on demand
        fileName: dbTemplate.fileName,
        fileType: dbTemplate.fileType,
        fileSize: dbTemplate.fileSize,
        isDefault: dbTemplate.isDefault,
        uploadDate: new Date(dbTemplate.createdAt),
        content: null, // Will be extracted when needed
        // Lazy file loader - fetch file only when needed
        loadFile: async () => {
          try {
            console.log('📥 Lazy loading template file:', dbTemplate.name);
            return await this.getTemplateFile(dbTemplate.id);
          } catch (error) {
            console.error('❌ Error lazy loading template file:', error);
            return null;
          }
        }
      };
    } catch (error) {
      console.error('❌ Error converting template:', error);
      throw error;
    }
  }

  // Convert multiple database templates to frontend format (WITH LAZY FILE LOADING)
  async convertToFrontendTemplates(dbTemplates: DatabaseTemplate[]): Promise<any[]> {
    try {
      // OPTIMIZATION: Don't download all files - create lazy loaders for each
      console.log('⚡ Creating lazy loaders for', dbTemplates.length, 'templates (no files downloaded yet)');
      const templates = await Promise.all(
        dbTemplates.map(template => this.convertToFrontendTemplate(template))
      );
      console.log('✅ Lazy loaders created - templates ready (files will load on-demand)');
      return templates;
    } catch (error) {
      console.error('❌ Error converting templates:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const templateService = new TemplateService();
export default templateService;
