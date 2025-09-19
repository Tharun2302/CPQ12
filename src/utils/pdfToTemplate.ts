import { ContentBlock, Template } from '../types/template';

// Helper function to convert number to word
const numberToWord = (num: number): string => {
  const words = [
    'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'
  ];
  
  if (num <= 20) {
    return words[num];
  } else if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    const tensWords = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    return ones === 0 ? tensWords[tens] : `${tensWords[tens]}-${words[ones]}`;
  } else {
    return num.toString();
  }
};

export interface ExtractedContent {
  header?: {
    companyName: string;
    logo?: string;
    tagline?: string;
  };
  recipient?: {
    name: string;
    company: string;
    email: string;
  };
  sender?: {
    name: string;
    company: string;
    address: string;
    email: string;
  };
  projectSummary?: {
    title: string;
    details: Array<{ label: string; value: string }>;
    totalCost: string;
  };
  costBreakdown?: {
    title: string;
    items: Array<{ description: string; amount: number }>;
    total: number;
  };
  includedFeatures?: {
    title: string;
    features: string[];
  };
  footer?: {
    companyName: string;
    address: string;
    phone: string;
    email: string;
    website: string;
  };
}

export const extractContentFromPdf = async (pdfBlob: Blob): Promise<ExtractedContent> => {
  // Extract data from the CloudFuze pricing agreement (second image)
  // This simulates extracting data from the actual PDF content
  
  const extractedContent: ExtractedContent = {
    header: {
      companyName: 'CloudFuze',
      tagline: 'X-Change Enterprise Data Migration Solution'
    },
    recipient: {
      name: 'Definitive Healthcare, LLC.',
      company: 'Definitive Healthcare, LLC.',
      email: 'contact@definitivehealthcare.com'
    },
    sender: {
      name: 'CloudFuze',
      company: 'CloudFuze, Inc.',
      address: '123 Business Street, City, State 12345',
      email: 'contact@cloudfuze.com'
    },
    projectSummary: {
      title: 'Project Summary',
      details: [
        { label: 'Migration Type', value: 'Managed Migration' },
        { label: 'Source Platform', value: 'Slack' },
        { label: 'Destination Platform', value: 'Teams' },
        { label: 'Users', value: '45' },
        { label: 'Scope', value: 'All Channels and DMs' },
        { label: 'Duration', value: '1 Month' },
        { label: 'Service Type', value: 'Cloud-Hosted SaaS Solution' }
      ],
      totalCost: '$2,000.00'
    },
    costBreakdown: {
      title: 'Cost Breakdown',
      items: [
        { description: 'CloudFuze X-Change Data Migration (Slack to Teams)', amount: 1500 },
        { description: 'Managed Migration Service (One-Time)', amount: 500 }
      ],
      total: 2000
    },
    includedFeatures: {
      title: 'Included Features',
      features: [
        'Fully Managed Migration',
        'Dedicated Project Manager',
        'Pre-Migration Analysis',
        'During Migration Consulting',
        'Post-Migration Support',
        'Data Reconciliation Support',
        'End-to-End Migration Assistance',
        '24/7 Premium Support',
        'Up to 45 Users Coverage',
        'All Channels and DMs Migration'
      ]
    },
    footer: {
      companyName: 'CloudFuze, Inc.',
      address: '123 Business Street, City, State 12345',
      phone: '+1 (555) 123-4567',
      email: 'contact@cloudfuze.com',
      website: 'www.cloudfuze.com'
    }
  };

  return extractedContent;
};

export const convertToTemplateBlocks = (content: ExtractedContent): ContentBlock[] => {
  const blocks: ContentBlock[] = [];
  let yOffset = 50;

  // Header Block with CloudFuze Branding
  if (content.header) {
    blocks.push({
      id: `block-${Date.now()}-header`,
      type: 'text',
      content: {
        text: `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px;">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #1e40af, #3b82f6); border-radius: 8px; margin-right: 10px; display: flex; align-items: center; justify-content: center;">
                  <span style="color: white; font-weight: bold; font-size: 18px;">CF</span>
                </div>
                <h1 style="color: #1e40af; font-size: 28px; font-weight: bold; margin: 0;">${content.header.companyName}</h1>
              </div>
            </div>
            <div style="text-align: right;">
              <p style="font-weight: bold; font-size: 16px; margin: 5px 0; color: #374151;">Microsoft Partner</p>
              <div style="background: linear-gradient(135deg, #fbbf24, #f59e0b); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; margin: 5px 0;">
                Gold Cloud Productivity
              </div>
              <p style="font-size: 14px; margin: 5px 0; color: #6b7280;">Microsoft</p>
            </div>
          </div>
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #1e40af; font-size: 24px; font-weight: bold; margin: 0;">CloudFuze Purchase Agreement for ${content.recipient?.name || 'Client'}</h2>
          </div>
          <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; border-left: 4px solid #1e40af; margin-bottom: 20px;">
            <p style="margin: 0; color: #374151; font-size: 14px;">
              This agreement provides ${content.recipient?.name || 'Client'} with pricing for use of the CloudFuze's X-Change Enterprise Data Migration Solution:
            </p>
          </div>
          <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 10px 15px; border-radius: 6px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 14px; font-weight: 500;">
              Cloud-Hosted SaaS Solution | Managed Migration | Dedicated Migration Manager
            </p>
          </div>
        `
      },
      position: { x: 50, y: yOffset },
      size: { width: 700, height: 180 },
      style: {
        fontSize: 14,
        color: '#374151',
        padding: 15
      },
      isSelected: false,
      isDragging: false
    });
    yOffset += 200;
  }

  // Quote Details Block
  blocks.push({
    id: `block-001-quote-details`,
    type: 'quote-details',
    content: {
      quoteNumber: 'CPQ-{AUTO}',
      date: '{CURRENT_DATE}',
      validUntil: '30 days'
    },
    position: { x: 50, y: yOffset },
    size: { width: 700, height: 100 },
    style: {
      fontSize: 16,
      color: '#374151',
      padding: 15,
      backgroundColor: '#f3f4f6',
      borderRadius: 8
    },
    isSelected: false,
    isDragging: false
  });
  yOffset += 120;

  // Recipient and Sender Info Block
  if (content.recipient && content.sender) {
    blocks.push({
      id: `block-${Date.now()}-contact-info`,
      type: 'text',
      content: {
        text: `
          <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
            <div style="flex: 1;">
              <h3 style="color: #1e40af; margin-bottom: 10px;">Bill To:</h3>
              <p style="font-weight: bold; margin: 5px 0;">${content.recipient.name}</p>
              <p style="margin: 5px 0;">${content.recipient.company}</p>
              <p style="margin: 5px 0;">${content.recipient.email}</p>
            </div>
            <div style="flex: 1;">
              <h3 style="color: #1e40af; margin-bottom: 10px;">From:</h3>
              <p style="font-weight: bold; margin: 5px 0;">${content.sender.name}</p>
              <p style="margin: 5px 0;">${content.sender.address}</p>
              <p style="margin: 5px 0;">${content.sender.email}</p>
            </div>
          </div>
        `
      },
      position: { x: 50, y: yOffset },
      size: { width: 700, height: 150 },
      style: {
        fontSize: 14,
        color: '#374151',
        padding: 15
      },
      isSelected: false,
      isDragging: false
    });
    yOffset += 170;
  }

  // Project Summary Block
  if (content.projectSummary) {
    blocks.push({
      id: `block-${Date.now()}-project-summary`,
      type: 'text',
      content: {
        text: `
          <h3 style="color: #1e40af; font-weight: bold; margin-bottom: 15px;">${content.projectSummary.title}</h3>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px;">
            ${content.projectSummary.details.map(detail => 
              `<p style="margin: 5px 0;"><strong>${detail.label}:</strong> ${detail.value}</p>`
            ).join('')}
            <p style="margin-top: 15px; font-size: 18px; font-weight: bold; color: #1e40af;">
              Total Cost: ${content.projectSummary.totalCost}
            </p>
          </div>
        `
      },
      position: { x: 50, y: yOffset },
      size: { width: 700, height: 200 },
      style: {
        fontSize: 14,
        color: '#374151',
        padding: 15
      },
      isSelected: false,
      isDragging: false
    });
    yOffset += 220;
  }

  // Cost Breakdown Block - Professional Table Format
  if (content.costBreakdown) {
    blocks.push({
      id: `block-${Date.now()}-cost-breakdown`,
      type: 'text',
      content: {
        text: `
          <h3 style="color: #1e40af; font-weight: bold; margin-bottom: 15px;">Services and Pricing</h3>
          <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <thead>
                <tr style="background-color: #6b7280; color: black;">
                  <th style="padding: 12px; text-align: left; border: 1px solid #6b7280; font-weight: bold;">Job Requirement</th>
                  <th style="padding: 12px; text-align: left; border: 1px solid #6b7280; font-weight: bold;">Description</th>
                  <th style="padding: 12px; text-align: left; border: 1px solid #6b7280; font-weight: bold;">Migration Type</th>
                  <th style="padding: 12px; text-align: right; border: 1px solid #6b7280; font-weight: bold;">Price(USD)</th>
                </tr>
              </thead>
              <tbody>
                ${content.costBreakdown.items.map(item => `
                  <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 500;">${item.description.split('(')[0].trim()}</td>
                    <td style="padding: 12px; border: 1px solid #e5e7eb;">
                      ${item.description.includes('(') ? item.description.split('(')[1].split(')')[0] : item.description}
                      ${item.description.includes('Slack to Teams') ? '<br><br>Up to 45 Users | All Channels and DMs' : ''}
                      ${item.description.includes('Managed Migration Service') ? '<br><br>Fully Managed Migration | Dedicated Project Manager | Pre-Migration Analysis | During Migration Consulting | Post-Migration Support and Data Reconciliation Support | End-to End Migration Assistance with 24*7 Premium Support' : ''}
                    </td>
                    <td style="padding: 12px; border: 1px solid #e5e7eb;">Managed Migration<br>One-Time</td>
                    <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right; font-weight: bold;">$${item.amount.toLocaleString()}.00</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div style="text-align: right; margin-top: 15px;">
              <p style="margin: 5px 0; font-size: 12px; color: #6b7280;">Valid for ${(() => {
                const durationDetail = content.projectSummary?.details.find(d => d.label === 'Duration');
                if (durationDetail) {
                  const durationMatch = durationDetail.value.match(/(\d+)/);
                  if (durationMatch) {
                    const duration = parseInt(durationMatch[1]);
                    return `${numberToWord(duration)} Month${duration > 1 ? 's' : ''}`;
                  }
                }
                return 'One Month';
              })()}</p>
              <p style="margin: 5px 0; font-size: 16px; font-weight: bold; color: #1e40af;">
                Total Price: $${content.costBreakdown.total.toLocaleString()}.00
              </p>
            </div>
          </div>
        `
      },
      position: { x: 50, y: yOffset },
      size: { width: 700, height: 300 },
      style: {
        fontSize: 14,
        color: '#374151',
        padding: 15
      },
      isSelected: false,
      isDragging: false
    });
    yOffset += 320;
  }

  // Included Features Block
  if (content.includedFeatures) {
    blocks.push({
      id: `block-${Date.now()}-features`,
      type: 'text',
      content: {
        text: `
          <h3 style="color: #1e40af; font-weight: bold; margin-bottom: 15px;">${content.includedFeatures.title}</h3>
          <ul style="list-style-type: disc; margin-left: 20px;">
            ${content.includedFeatures.features.map(feature => 
              `<li style="margin: 5px 0;">${feature}</li>`
            ).join('')}
          </ul>
        `
      },
      position: { x: 50, y: yOffset },
      size: { width: 700, height: 150 },
      style: {
        fontSize: 14,
        color: '#374151',
        padding: 15
      },
      isSelected: false,
      isDragging: false
    });
    yOffset += 170;
  }

  // Footer Block with CloudFuze Contact Information
  blocks.push({
    id: `block-${Date.now()}-footer`,
    type: 'text',
    content: {
      text: `
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; border-top: 2px solid #e5e7eb; margin-top: 30px;">
          <div style="text-align: center; margin-bottom: 15px;">
            <p style="margin: 5px 0; font-size: 14px; color: #6b7280;">
              CloudFuze, Inc.
            </p>
            <p style="margin: 5px 0; font-size: 14px; color: #6b7280;">
              2500 Regency Parkway, Cary, NC 27518
            </p>
            <p style="margin: 5px 0; font-size: 14px; color: #1e40af;">
              https://www.cloudfuze.com/
            </p>
            <p style="margin: 5px 0; font-size: 14px; color: #6b7280;">
              Phone: +1 252-558-9019
            </p>
            <p style="margin: 5px 0; font-size: 14px; color: #1e40af;">
              Email: sales@cloudfuze.com
            </p>
            <p style="margin: 5px 0; font-size: 14px; color: #1e40af;">
              support@cloudfuze.com
            </p>
          </div>
          <div style="text-align: center; margin-top: 15px;">
            <p style="margin: 5px 0; font-size: 12px; color: #9ca3af; font-weight: 500;">Classification: Confidential</p>
            <p style="margin: 5px 0; font-size: 12px; color: #9ca3af;">Page 1 of 1</p>
          </div>
        </div>
      `
    },
    position: { x: 50, y: yOffset },
    size: { width: 700, height: 140 },
    style: {
      fontSize: 12,
      color: '#6b7280',
      textAlign: 'center',
      padding: 20,
      backgroundColor: '#f9fafb',
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb'
    },
    isSelected: false,
    isDragging: false
  });

  return blocks;
};

export const createTemplateFromPdf = async (pdfBlob: Blob, templateName: string): Promise<Template> => {
  const extractedContent = await extractContentFromPdf(pdfBlob);
  const blocks = convertToTemplateBlocks(extractedContent);

  return {
    id: `template-${Date.now()}`,
    name: templateName,
    description: 'Template created from merged PDF',
    blocks,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false
  };
};

// New function to create SOW template from extracted data
export const createSOWTemplateFromData = (extractedData: ExtractedContent, templateName: string = 'SOW Template'): Template => {
  const blocks: ContentBlock[] = [];
  let yOffset = 50;

  // Header Block with Company Info
  blocks.push({
    id: `block-${Date.now()}-header`,
    type: 'header',
    content: {
      companyName: extractedData.header?.companyName || 'CloudFuze',
      tagline: extractedData.header?.tagline || 'X-Change Enterprise Data Migration Solution',
      logo: extractedData.header?.logo
    },
    position: { x: 50, y: yOffset },
    size: { width: 700, height: 100 },
    style: {
      fontSize: 16,
      color: '#1e40af',
      textAlign: 'center',
      padding: 20,
      backgroundColor: '#f8fafc',
      borderBottomWidth: 2,
      borderBottomColor: '#1e40af'
    },
    isSelected: false,
    isDragging: false
  });
  yOffset += 120;

  // Client Information Block
  if (extractedData.recipient) {
    blocks.push({
      id: `block-${Date.now()}-client-info`,
      type: 'text',
      content: {
        text: `
          <h3 style="color: #1e40af; font-weight: bold; margin-bottom: 15px;">Client Information</h3>
          <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; border-left: 4px solid #1e40af;">
            <p style="margin: 5px 0;"><strong>Client Name:</strong> ${extractedData.recipient.name}</p>
            <p style="margin: 5px 0;"><strong>Company:</strong> ${extractedData.recipient.company}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${extractedData.recipient.email}</p>
          </div>
        `
      },
      position: { x: 50, y: yOffset },
      size: { width: 700, height: 120 },
      style: {
        fontSize: 14,
        color: '#374151',
        padding: 15
      },
      isSelected: false,
      isDragging: false
    });
    yOffset += 140;
  }

  // Project Scope Block
  if (extractedData.projectSummary) {
    blocks.push({
      id: `block-${Date.now()}-project-scope`,
      type: 'text',
      content: {
        text: `
          <h3 style="color: #1e40af; font-weight: bold; margin-bottom: 15px;">Project Scope</h3>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px;">
            ${extractedData.projectSummary.details.map(detail => 
              `<p style="margin: 5px 0;"><strong>${detail.label}:</strong> ${detail.value}</p>`
            ).join('')}
          </div>
        `
      },
      position: { x: 50, y: yOffset },
      size: { width: 700, height: 200 },
      style: {
        fontSize: 14,
        color: '#374151',
        padding: 15
      },
      isSelected: false,
      isDragging: false
    });
    yOffset += 220;
  }

  // Services and Pricing Block
  if (extractedData.costBreakdown) {
    blocks.push({
      id: `block-${Date.now()}-services-pricing`,
      type: 'text',
      content: {
        text: `
          <h3 style="color: #1e40af; font-weight: bold; margin-bottom: 15px;">Services and Pricing</h3>
          <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #6b7280; color: black;">
                  <th style="padding: 12px; text-align: left; border: 1px solid #6b7280;">Service Description</th>
                  <th style="padding: 12px; text-align: right; border: 1px solid #6b7280;">Amount (USD)</th>
                </tr>
              </thead>
              <tbody>
                ${extractedData.costBreakdown.items.map(item => `
                  <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 12px;">${item.description}</td>
                    <td style="padding: 12px; text-align: right; font-weight: bold;">$${item.amount.toLocaleString()}.00</td>
                  </tr>
                `).join('')}
                <tr style="background-color: #f0f9ff; font-weight: bold;">
                  <td style="padding: 12px;">Total Project Cost</td>
                  <td style="padding: 12px; text-align: right; color: #1e40af;">$${extractedData.costBreakdown.total.toLocaleString()}.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        `
      },
      position: { x: 50, y: yOffset },
      size: { width: 700, height: 250 },
      style: {
        fontSize: 14,
        color: '#374151',
        padding: 15
      },
      isSelected: false,
      isDragging: false
    });
    yOffset += 270;
  }

  // Deliverables and Features Block
  if (extractedData.includedFeatures) {
    blocks.push({
      id: `block-${Date.now()}-deliverables`,
      type: 'text',
      content: {
        text: `
          <h3 style="color: #1e40af; font-weight: bold; margin-bottom: 15px;">Deliverables and Features</h3>
          <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px;">
            <ul style="list-style-type: disc; margin-left: 20px;">
              ${extractedData.includedFeatures.features.map(feature => 
                `<li style="margin: 8px 0; font-weight: 500;">${feature}</li>`
              ).join('')}
            </ul>
          </div>
        `
      },
      position: { x: 50, y: yOffset },
      size: { width: 700, height: 200 },
      style: {
        fontSize: 14,
        color: '#374151',
        padding: 15
      },
      isSelected: false,
      isDragging: false
    });
    yOffset += 220;
  }

  // Terms and Conditions Block
  blocks.push({
    id: `block-${Date.now()}-terms`,
    type: 'text',
    content: {
      text: `
        <h3 style="color: #1e40af; font-weight: bold; margin-bottom: 15px;">Terms and Conditions</h3>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; border-left: 4px solid #1e40af;">
          <p style="margin: 8px 0;"><strong>Project Duration:</strong> ${extractedData.projectSummary?.details.find(d => d.label === 'Duration')?.value || '1 Month'}</p>
          <p style="margin: 8px 0;"><strong>Payment Terms:</strong> 50% upfront, 50% upon completion</p>
          <p style="margin: 8px 0;"><strong>Service Level:</strong> 24/7 Premium Support included</p>
          <p style="margin: 8px 0;"><strong>Warranty:</strong> 30-day post-migration support</p>
        </div>
      `
    },
    position: { x: 50, y: yOffset },
    size: { width: 700, height: 150 },
    style: {
      fontSize: 14,
      color: '#374151',
      padding: 15
    },
    isSelected: false,
    isDragging: false
  });
  yOffset += 170;

  // Footer Block
  if (extractedData.footer) {
    blocks.push({
      id: `block-${Date.now()}-footer`,
      type: 'footer',
      content: extractedData.footer,
      position: { x: 50, y: yOffset },
      size: { width: 700, height: 120 },
      style: {
        fontSize: 12,
        color: '#6b7280',
        textAlign: 'center',
        padding: 20,
        backgroundColor: '#f9fafb',
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb'
      },
      isSelected: false,
      isDragging: false
    });
  }

  return {
    id: `sow-template-${Date.now()}`,
    name: templateName,
    description: 'Statement of Work template created from extracted data',
    blocks,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false
  };
};
