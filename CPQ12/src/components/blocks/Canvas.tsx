import React, { useRef, useState } from 'react';
import { useDrop } from 'react-dnd';
import { ContentBlock, DragItem } from '../../types/template';
import { getBlockLibraryItem } from '../../data/blockLibrary';
import BlockRenderer from './BlockRenderer';

interface CanvasProps {
  blocks: ContentBlock[];
  onBlockAdd: (block: ContentBlock) => void;
  onBlockSelect: (blockId: string) => void;
  onBlockUpdate: (blockId: string, updates: Partial<ContentBlock>) => void;
  onBlockDelete: (blockId: string) => void;
  selectedBlockId?: string;
}

const Canvas: React.FC<CanvasProps> = ({
  blocks,
  onBlockAdd,
  onBlockSelect,
  onBlockUpdate,
  onBlockDelete,
  selectedBlockId
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const [{ isOver }, drop] = useDrop({
    accept: 'block',
    drop: (item: DragItem, monitor) => {
      if (!monitor.didDrop()) {
        const offset = monitor.getClientOffset();
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        
        if (offset && canvasRect) {
          const x = offset.x - canvasRect.left;
          const y = offset.y - canvasRect.top;
          
          if (item.blockType) {
            const blockLibraryItem = getBlockLibraryItem(item.blockType);
            if (blockLibraryItem) {
              const newBlock: ContentBlock = {
                id: `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: item.blockType,
                content: { ...blockLibraryItem.defaultContent },
                position: { x, y },
                size: { width: 300, height: 100 },
                style: { ...blockLibraryItem.defaultStyle },
                isSelected: false,
                isDragging: false
              };
              onBlockAdd(newBlock);
            }
          }
        }
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  });

  const handleCanvasClick = (e: React.MouseEvent) => {
    // Deselect all blocks when clicking on empty canvas
    if (e.target === e.currentTarget) {
      onBlockSelect('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (selectedBlockId) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        onBlockDelete(selectedBlockId);
      }
    }
  };

  return (
    <div
      ref={(node) => {
        drop(node);
        canvasRef.current = node;
      }}
      className={`flex-1 bg-gray-50 relative overflow-auto ${
        isOver ? 'bg-blue-50' : ''
      }`}
      onClick={handleCanvasClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Canvas Grid Background */}
      <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none" />
      
      {/* Canvas Content */}
      <div className="relative w-full h-full min-h-[800px] bg-white shadow-lg mx-auto" style={{ maxWidth: '800px' }}>
        {/* Drop Zone Indicator */}
        {isOver && (
          <div className="absolute inset-0 border-2 border-dashed border-blue-400 bg-blue-50 bg-opacity-20 pointer-events-none" />
        )}
        
        {/* Blocks */}
        {blocks.map((block) => (
          <BlockRenderer
            key={block.id}
            block={{
              ...block,
              isSelected: block.id === selectedBlockId
            }}
            onSelect={onBlockSelect}
            onEdit={(blockId) => {
              // Handle block editing - could open a modal
              console.log('Edit block:', blockId);
            }}
          />
        ))}
        
        {/* Empty State */}
        {blocks.length === 0 && !isOver && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-gray-400 text-6xl mb-4">📄</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Empty Template</h3>
              <p className="text-gray-600 mb-4">Drag content blocks from the library to start building your template</p>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <span>💡 Tip:</span>
                <span>Start with a header, add quote details, and include a cost breakdown</span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Canvas Controls */}
      <div className="absolute bottom-4 right-4 flex gap-2">
        <button
          onClick={() => {
            // Zoom out
            console.log('Zoom out');
          }}
          className="p-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50"
        >
          🔍-
        </button>
        <button
          onClick={() => {
            // Zoom in
            console.log('Zoom in');
          }}
          className="p-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50"
        >
          🔍+
        </button>
        <button
          onClick={() => {
            // Fit to screen
            console.log('Fit to screen');
          }}
          className="p-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50"
        >
          📐
        </button>
      </div>
    </div>
  );
};

export default Canvas;
