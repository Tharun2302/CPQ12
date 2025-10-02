import { BlockLibraryItem } from '../types/template';

export const blockLibrary: BlockLibraryItem[] = [
  // Basic Blocks
  {
    type: 'header',
    name: 'Header',
    description: 'Company header with logo and branding',
    icon: '🏢',
    category: 'basic',
    defaultContent: {
      companyName: 'ZENOP Pro Solutions',
      logo: null,
      tagline: 'Professional Quote Solutions'
    },
    defaultStyle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#1e40af',
      textAlign: 'center',
      padding: 20,
      backgroundColor: '#f8fafc'
    }
  },
  {
    type: 'text',
    name: 'Text Block',
    description: 'Add custom text content',
    icon: '📝',
    category: 'basic',
    defaultContent: {
      text: 'Enter your text here...'
    },
    defaultStyle: {
      fontSize: 14,
      color: '#374151',
      textAlign: 'left',
      padding: 10
    }
  },
  {
    type: 'image',
    name: 'Image',
    description: 'Add images or logos',
    icon: '🖼️',
    category: 'basic',
    defaultContent: {
      src: '',
      alt: 'Image',
      width: 200,
      height: 150
    },
    defaultStyle: {
      textAlign: 'center',
      padding: 10
    }
  },
  {
    type: 'divider',
    name: 'Divider',
    description: 'Horizontal line separator',
    icon: '➖',
    category: 'basic',
    defaultContent: {
      style: 'solid'
    },
    defaultStyle: {
      borderWidth: 1,
      borderColor: '#d1d5db',
      margin: 20
    }
  },
  {
    type: 'spacer',
    name: 'Spacer',
    description: 'Add vertical space',
    icon: '↕️',
    category: 'basic',
    defaultContent: {
      height: 20
    },
    defaultStyle: {
      margin: 10
    }
  },

  // Quote-specific Blocks
  {
    type: 'quote-details',
    name: 'Quote Details',
    description: 'Quote number, date, and basic info',
    icon: '📋',
    category: 'quote',
    defaultContent: {
      quoteNumber: 'CPQ-{AUTO}',
      date: '{CURRENT_DATE}',
      validUntil: '30 days'
    },
    defaultStyle: {
      fontSize: 16,
      color: '#374151',
      padding: 15,
      backgroundColor: '#f3f4f6',
      borderRadius: 8
    }
  },
  {
    type: 'cost-breakdown',
    name: 'Cost Breakdown',
    description: 'Itemized cost table',
    icon: '💰',
    category: 'quote',
    defaultContent: {
      items: [
        { description: 'Service 1', amount: 0 },
        { description: 'Service 2', amount: 0 }
      ],
      total: 0
    },
    defaultStyle: {
      fontSize: 14,
      padding: 15,
      backgroundColor: '#ffffff',
      borderWidth: 1,
      borderColor: '#e5e7eb',
      borderRadius: 8
    }
  },
  {
    type: 'signature',
    name: 'Signature',
    description: 'Digital signature field',
    icon: '✍️',
    category: 'quote',
    defaultContent: {
      placeholder: 'Click to sign',
      required: true
    },
    defaultStyle: {
      fontSize: 14,
      color: '#6b7280',
      padding: 20,
      borderWidth: 2,
      borderColor: '#d1d5db',
      borderStyle: 'dashed',
      borderRadius: 8,
      textAlign: 'center'
    }
  },
  {
    type: 'footer',
    name: 'Footer',
    description: 'Company footer with contact info',
    icon: '📄',
    category: 'basic',
    defaultContent: {
      companyName: 'ZENOP Pro Solutions',
      address: '123 Business Street, City, State 12345',
      phone: '+1 (555) 123-4567',
      email: 'contact@cpqsolutions.com',
      website: 'www.cpqsolutions.com'
    },
    defaultStyle: {
      fontSize: 12,
      color: '#6b7280',
      textAlign: 'center',
      padding: 20,
      backgroundColor: '#f9fafb',
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb'
    }
  }
];

export const getBlockLibraryByCategory = (category: 'basic' | 'quote' | 'advanced') => {
  return blockLibrary.filter(block => block.category === category);
};

export const getBlockLibraryItem = (type: string) => {
  return blockLibrary.find(block => block.type === type);
};
