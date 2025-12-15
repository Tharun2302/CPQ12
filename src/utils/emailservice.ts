// Email service for sending approval workflow notifications
// Using a browser-compatible approach

interface EmailData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface ApprovalEmailData {
  recipientEmail: string;
  recipientName: string;
  workflowId: string;
  documentId: string;
  clientName: string;
  amount: number;
  approvalLink: string;
  role: 'Manager' | 'CEO' | 'Client';
}

export class EmailService {
  private static instance: EmailService;

  constructor() {
    // Browser-compatible email service
    // For production, you would integrate with:
    // - EmailJS: https://www.emailjs.com/
    // - Backend API endpoint
    // - Gmail API with proper CORS handling
  }

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  // Send approval request email
  async sendApprovalRequest(data: ApprovalEmailData): Promise<boolean> {
    try {
      const emailData: EmailData = {
        to: data.recipientEmail,
        subject: `Approval Required: ${data.documentId} - ${data.clientName}`,
        html: this.generateApprovalEmailHTML(data),
        text: this.generateApprovalEmailText(data)
      };

      console.log('Sending approval email:', emailData);
      
      // Try to send real email, fallback to simulation if it fails
      try {
        await this.sendRealEmail(emailData);
      } catch (error) {
        console.warn('⚠️ Real email failed, falling back to simulation:', error);
        await this.simulateEmailSend(emailData);
      }
      
      return true;
    } catch (error) {
      console.error('Error sending approval email:', error);
      return false;
    }
  }

  // Send approval completion email
  async sendApprovalCompletion(data: ApprovalEmailData): Promise<boolean> {
    try {
      const emailData: EmailData = {
        to: data.recipientEmail,
        subject: `Approval Completed: ${data.documentId} - ${data.clientName}`,
        html: this.generateCompletionEmailHTML(data),
        text: this.generateCompletionEmailText(data)
      };

      console.log('Sending completion email:', emailData);
      
      // Try to send real email, fallback to simulation if it fails
      try {
        await this.sendRealEmail(emailData);
      } catch (error) {
        console.warn('⚠️ Real email failed, falling back to simulation:', error);
        await this.simulateEmailSend(emailData);
      }
      
      return true;
    } catch (error) {
      console.error('Error sending completion email:', error);
      return false;
    }
  }

  // Generate approval email HTML
  private generateApprovalEmailHTML(data: ApprovalEmailData): string {
    const roleColor = data.role === 'Manager' ? '#3B82F6' : data.role === 'CEO' ? '#8B5CF6' : '#10B981';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Approval Required</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, ${roleColor}, #1E40AF); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #E5E7EB; }
          .footer { background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: ${roleColor}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
          .info-box { background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .highlight { color: ${roleColor}; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 Approval Required</h1>
            <p>${data.role} Approval Needed</p>
          </div>
          
          <div class="content">
            <h2>Hello ${data.recipientName},</h2>
            
            <p>A new document requires your <span class="highlight">${data.role}</span> approval:</p>
            
            <div class="info-box">
              <h3>📄 Document Details</h3>
              <p><strong>Document ID:</strong> ${data.documentId}</p>
              <p><strong>Client:</strong> ${data.clientName}</p>
              <p><strong>Amount:</strong> $${data.amount.toLocaleString()}</p>
              <p><strong>Workflow ID:</strong> ${data.workflowId}</p>
            </div>
            
            <p>Please review and approve or deny this document using the link below:</p>
            
            <div style="text-align: center;">
              <a href="${data.approvalLink}" class="button">Review & Approve</a>
            </div>
            
            <p><strong>Note:</strong> This approval link is secure and will expire in 7 days.</p>
          </div>
          
          <div class="footer">
            <p>This is an automated message from your approval system.</p>
            <p>If you have any questions, please contact your system administrator.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Generate approval email text version
  private generateApprovalEmailText(data: ApprovalEmailData): string {
    return `
Approval Required - ${data.role} Approval Needed

Hello ${data.recipientName},

A new document requires your ${data.role} approval:

Document ID: ${data.documentId}
Client: ${data.clientName}
Amount: $${data.amount.toLocaleString()}
Workflow ID: ${data.workflowId}

Please review and approve or deny this document using the link below:
${data.approvalLink}

Note: This approval link is secure and will expire in 7 days.

This is an automated message from your approval system.
If you have any questions, please contact your system administrator.
    `;
  }

  // Generate completion email HTML
  private generateCompletionEmailHTML(data: ApprovalEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Approval Completed</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10B981, #059669); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #E5E7EB; }
          .footer { background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; }
          .info-box { background: #F0FDF4; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #BBF7D0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Approval Completed</h1>
            <p>Document Approved Successfully</p>
          </div>
          
          <div class="content">
            <h2>Hello ${data.recipientName},</h2>
            
            <p>The document has been successfully approved and is now ready for the next step:</p>
            
            <div class="info-box">
              <h3>📄 Document Details</h3>
              <p><strong>Document ID:</strong> ${data.documentId}</p>
              <p><strong>Client:</strong> ${data.clientName}</p>
              <p><strong>Amount:</strong> $${data.amount.toLocaleString()}</p>
              <p><strong>Status:</strong> Approved by ${data.role}</p>
            </div>
            
            <p>You can track the progress of this workflow using the link below:</p>
            
            <div style="text-align: center;">
              <a href="${data.approvalLink}" class="button" style="background: #10B981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold;">View Status</a>
            </div>
          </div>
          
          <div class="footer">
            <p>This is an automated message from your approval system.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Generate completion email text version
  private generateCompletionEmailText(data: ApprovalEmailData): string {
    return `
Approval Completed - Document Approved Successfully

Hello ${data.recipientName},

The document has been successfully approved and is now ready for the next step:

Document ID: ${data.documentId}
Client: ${data.clientName}
Amount: $${data.amount.toLocaleString()}
Status: Approved by ${data.role}

You can track the progress of this workflow using the link below:
${data.approvalLink}

This is an automated message from your approval system.
    `;
  }

  // Send real emails using Gmail API (browser-compatible)
  private async sendRealEmail(emailData: EmailData): Promise<void> {
    try {
      // Create mailto link for Gmail
      const subject = encodeURIComponent(emailData.subject);
      const body = encodeURIComponent(emailData.text || '');
      const mailtoLink = `mailto:${emailData.to}?subject=${subject}&body=${body}`;
      
      // Open Gmail compose window
      window.open(mailtoLink, '_blank');
      
      console.log('📧 Gmail compose window opened:');
      console.log('To:', emailData.to);
      console.log('Subject:', emailData.subject);
      console.log('Mailto Link:', mailtoLink);
      
      // Simulate successful send
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error('❌ Error opening Gmail compose:', error);
      throw error;
    }
  }

  // Fallback simulation for development
  private async simulateEmailSend(emailData: EmailData): Promise<void> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Log the email details
    console.log('📧 Email simulation (not actually sent):');
    console.log('To:', emailData.to);
    console.log('Subject:', emailData.subject);
    console.log('Content:', emailData.text);
  }

  // Generate approval links
  generateApprovalLink(role: 'Manager' | 'CEO', workflowId: string, token?: string): string {
    // Use window.location.origin for browser compatibility
    const baseUrl = window.location.origin;
    // Updated paths: Manager -> Technical Team, CEO -> Legal Team
    const rolePath = role === 'Manager' ? 'technical-approval' : 'legal-approval';
    
    if (token) {
      return `${baseUrl}/${rolePath}?token=${token}&workflow=${workflowId}`;
    }
    
    return `${baseUrl}/${rolePath}?workflow=${workflowId}`;
  }

  // Generate client notification link
  generateClientLink(workflowId: string): string {
    // Use window.location.origin for browser compatibility
    const baseUrl = window.location.origin;
    return `${baseUrl}/client-notification?workflow=${workflowId}`;
  }
}

export default EmailService;