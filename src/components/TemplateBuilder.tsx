import React, { useState, useCallback, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ContentBlock, Template } from '../types/template';
import BlockLibrary from './blocks/BlockLibrary';
import Canvas from './blocks/Canvas';
import { Save, Download, Eye, Settings, Plus } from 'lucide-react';

interface TemplateBuilderProps {
  onSave?: (template: Template) => void;
  onPreview?: (template: Template) => void;
  onExport?: (template: Template) => void;
  initialTemplate?: Template;
}

const TemplateBuilder: React.FC<TemplateBuilderProps> = ({
  onSave,
  onPreview,
  onExport,
  initialTemplate
}) => {
  const [blocks, setBlocks] = useState<ContentBlock[]>(initialTemplate?.blocks || []);
  const [selectedBlockId, setSelectedBlockId] = useState<string>('');
  const [templateName, setTemplateName] = useState(initialTemplate?.name || 'New Template');
  const [showPreview, setShowPreview] = useState(false);

  // Load template from PDF if available
  useEffect(() => {
    const templateFromPdf = localStorage.getItem('templateFromPdf');
    if (templateFromPdf && blocks.length === 0) {
      try {
        const template = JSON.parse(templateFromPdf);
        console.log('🔄 Loading template from PDF:', template);
        
        setBlocks(template.blocks || []);
        setTemplateName(template.name || 'Template from PDF');
        
        // Clear the localStorage after loading
        localStorage.removeItem('templateFromPdf');
        
        console.log('✅ Template loaded successfully');
      } catch (error) {
        console.error('❌ Error loading template from PDF:', error);
      }
    }
  }, [blocks.length]);

  const handleBlockAdd = useCallback((newBlock: ContentBlock) => {
    setBlocks(prev => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
  }, []);

  const handleBlockSelect = useCallback((blockId: string) => {
    setSelectedBlockId(blockId);
  }, []);

  const handleBlockUpdate = useCallback((blockId: string, updates: Partial<ContentBlock>) => {
    setBlocks(prev => prev.map(block => 
      block.id === blockId ? { ...block, ...updates } : block
    ));
  }, []);

  const handleBlockDelete = useCallback((blockId: string) => {
    setBlocks(prev => prev.filter(block => block.id !== blockId));
    setSelectedBlockId('');
  }, []);

  const handleSave = () => {
    const template: Template = {
      id: initialTemplate?.id || `template-${Date.now()}`,
      name: templateName,
      blocks,
      createdAt: initialTemplate?.createdAt || new Date(),
      updatedAt: new Date(),
      isDefault: initialTemplate?.isDefault || false
    };
    onSave?.(template);
  };

  const handlePreview = () => {
    const template: Template = {
      id: initialTemplate?.id || `template-${Date.now()}`,
      name: templateName,
      blocks,
      createdAt: initialTemplate?.createdAt || new Date(),
      updatedAt: new Date(),
      isDefault: initialTemplate?.isDefault || false
    };
    onPreview?.(template);
    setShowPreview(true);
  };

  const handleExport = () => {
    const template: Template = {
      id: initialTemplate?.id || `template-${Date.now()}`,
      name: templateName,
      blocks,
      createdAt: initialTemplate?.createdAt || new Date(),
      updatedAt: new Date(),
      isDefault: initialTemplate?.isDefault || false
    };
    onExport?.(template);
  };

  const handleUndo = () => {
    // TODO: Implement undo functionality
    console.log('Undo');
  };

  const handleRedo = () => {
    // TODO: Implement redo functionality
    console.log('Redo');
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen flex flex-col bg-gray-100">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-gray-900">Template Builder</h1>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Template name..."
              />
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={handleUndo}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                title="Undo"
              >
                ↩️
              </button>
              <button
                onClick={handleRedo}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                title="Redo"
              >
                ↪️
              </button>
              <button
                onClick={handlePreview}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Block Library */}
          <BlockLibrary 
            onBlockSelect={(blockType) => {
              // Auto-add block to center of canvas
              const newBlock: ContentBlock = {
                id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: blockType as any,
                content: {},
                position: { x: 250, y: 200 },
                size: { width: 300, height: 100 },
                style: {},
                isSelected: false,
                isDragging: false
              };
              handleBlockAdd(newBlock);
            }}
          />

          {/* Canvas */}
          <Canvas
            blocks={blocks}
            onBlockAdd={handleBlockAdd}
            onBlockSelect={handleBlockSelect}
            onBlockUpdate={handleBlockUpdate}
            onBlockDelete={handleBlockDelete}
            selectedBlockId={selectedBlockId}
          />

          {/* Properties Panel */}
          <div className="w-80 bg-white border-l border-gray-200 p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Properties</h3>
            
            {selectedBlockId ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Block Type
                  </label>
                  <p className="text-sm text-gray-900">
                    {blocks.find(b => b.id === selectedBlockId)?.type}
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Position
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="X"
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Y"
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Size
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Width"
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Height"
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                </div>
                
                <button
                  onClick={() => handleBlockDelete(selectedBlockId)}
                  className="w-full px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete Block
                </button>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-gray-400 text-4xl mb-2">📋</div>
                <p className="text-gray-600 text-sm">Select a block to edit its properties</p>
              </div>
            )}
          </div>
        </div>

        {/* Status Bar */}
        <div className="bg-white border-t border-gray-200 px-6 py-2">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div>
              {blocks.length} blocks • {selectedBlockId ? '1 selected' : 'No selection'}
            </div>
            <div>
              Template Builder v1.0
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
};

export default TemplateBuilder;
