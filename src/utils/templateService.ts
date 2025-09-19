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
      const file = new File([blob], fileName, { type: blob.type });
      
      console.log('✅ Template file fetched:', fileName);
      return file;

    } catch (error) {
      console.error('❌ Error fetching template file:', error);
      throw error;
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

  // Convert database template to frontend template format
  async convertToFrontendTemplate(dbTemplate: DatabaseTemplate): Promise<any> {
    try {
      // Fetch the actual file
      const file = await this.getTemplateFile(dbTemplate.id);
      
      return {
        id: dbTemplate.id,
        name: dbTemplate.name,
        description: dbTemplate.description,
        file: file,
        fileName: dbTemplate.fileName,
        fileType: dbTemplate.fileType,
        fileSize: dbTemplate.fileSize,
        isDefault: dbTemplate.isDefault,
        uploadDate: new Date(dbTemplate.createdAt),
        content: null // Will be extracted when needed
      };
    } catch (error) {
      console.error('❌ Error converting template:', error);
      throw error;
    }
  }

  // Convert multiple database templates to frontend format
  async convertToFrontendTemplates(dbTemplates: DatabaseTemplate[]): Promise<any[]> {
    try {
      const templates = await Promise.all(
        dbTemplates.map(template => this.convertToFrontendTemplate(template))
      );
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
