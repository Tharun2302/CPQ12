import React from 'react';
import { ContentBlock } from '../../types/template';

interface BlockRendererProps {
  block: ContentBlock;
  onSelect?: (blockId: string) => void;
  onEdit?: (blockId: string) => void;
  isPreview?: boolean;
}

const BlockRenderer: React.FC<BlockRendererProps> = ({
  block,
  onSelect,
  onEdit,
  isPreview = false
}) => {
  const handleClick = () => {
    if (!isPreview && onSelect) {
      onSelect(block.id);
    }
  };

  const handleDoubleClick = () => {
    if (!isPreview && onEdit) {
      onEdit(block.id);
    }
  };

  const renderBlockContent = () => {
    switch (block.type) {
      case 'header':
        return (
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">{block.content.companyName}</h1>
            {block.content.tagline && (
              <p className="text-gray-600">{block.content.tagline}</p>
            )}
            {block.content.logo && (
              <img 
                src={block.content.logo} 
                alt="Company Logo" 
                className="mx-auto mb-4 max-h-16"
              />
            )}
          </div>
        );

      case 'text':
        return (
          <div 
            className="w-full"
            dangerouslySetInnerHTML={{ __html: block.content.text }}
          />
        );

      case 'image':
        return (
          <div className="text-center">
            {block.content.src ? (
              <img 
                src={block.content.src} 
                alt={block.content.alt}
                style={{
                  width: block.content.width,
                  height: block.content.height
                }}
                className="mx-auto"
              />
            ) : (
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center"
                style={{
                  width: block.content.width,
                  height: block.content.height
                }}
              >
                <span className="text-gray-500">Click to add image</span>
              </div>
            )}
          </div>
        );

      case 'divider':
        return (
          <hr className="w-full border-gray-300" />
        );

      case 'spacer':
        return (
          <div style={{ height: block.content.height }} />
        );

      case 'quote-details':
        return (
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">Quote #:</span>
                <p className="text-gray-900">{block.content.quoteNumber}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Date:</span>
                <p className="text-gray-900">{block.content.date}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Valid Until:</span>
                <p className="text-gray-900">{block.content.validUntil}</p>
              </div>
            </div>
          </div>
        );

      case 'cost-breakdown':
        return (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Description</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Amount</th>
                </tr>
              </thead>
              <tbody>
                {block.content.items.map((item: any, index: number) => (
                  <tr key={index} className="border-t border-gray-200">
                    <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      ${item.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-sm text-gray-900">Total</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    ${block.content.total.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );

      case 'signature':
        return (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <div className="text-gray-500 mb-2">
              <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
            <p className="text-sm text-gray-600">{block.content.placeholder}</p>
          </div>
        );

      case 'footer':
        return (
          <div className="text-center text-sm text-gray-600">
            <p className="font-medium mb-1">{block.content.companyName}</p>
            <p className="mb-1">{block.content.address}</p>
            <p className="mb-1">Phone: {block.content.phone}</p>
            <p className="mb-1">Email: {block.content.email}</p>
            <p>Website: {block.content.website}</p>
          </div>
        );

      default:
        return <div>Unknown block type: {block.type}</div>;
    }
  };

  const blockStyle = {
    position: 'absolute' as const,
    left: block.position.x,
    top: block.position.y,
    width: block.size.width,
    height: block.size.height,
    ...block.style,
    cursor: isPreview ? 'default' : 'pointer',
    border: block.isSelected ? '2px solid #3b82f6' : '1px solid transparent',
    backgroundColor: block.style.backgroundColor || 'transparent',
    padding: block.style.padding || 0,
    margin: block.style.margin || 0,
    borderRadius: block.style.borderRadius || 0,
    fontSize: block.style.fontSize || 14,
    fontWeight: block.style.fontWeight || 'normal',
    color: block.style.color || '#000000',
    textAlign: block.style.textAlign || 'left',
  };

  return (
    <div
      style={blockStyle}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={`block-renderer ${block.isSelected ? 'selected' : ''} ${isPreview ? 'preview' : 'editable'}`}
    >
      {renderBlockContent()}
    </div>
  );
};

export default BlockRenderer;
