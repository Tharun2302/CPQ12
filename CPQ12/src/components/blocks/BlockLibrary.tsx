import React, { useState } from 'react';
import { useDrag } from 'react-dnd';
import { BlockLibraryItem, DragItem } from '../../types/template';
import { blockLibrary, getBlockLibraryByCategory } from '../../data/blockLibrary';

interface BlockLibraryProps {
  onBlockSelect?: (blockType: string) => void;
}

const DraggableBlock: React.FC<{ block: BlockLibraryItem }> = ({ block }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'block',
    item: {
      type: 'block',
      blockType: block.type,
      source: 'library'
    } as DragItem,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <div
      ref={drag}
      className={`p-3 border border-gray-200 rounded-lg cursor-move hover:border-blue-300 hover:bg-blue-50 transition-all duration-200 ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="text-2xl">{block.icon}</div>
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 text-sm">{block.name}</h4>
          <p className="text-xs text-gray-600">{block.description}</p>
        </div>
      </div>
    </div>
  );
};

const BlockLibrary: React.FC<BlockLibraryProps> = ({ onBlockSelect }) => {
  const [selectedCategory, setSelectedCategory] = useState<'basic' | 'quote' | 'advanced'>('basic');

  const categories = [
    { id: 'basic', name: 'Basic', icon: '📝' },
    { id: 'quote', name: 'Quote', icon: '📋' },
    { id: 'advanced', name: 'Advanced', icon: '⚙️' }
  ] as const;

  const filteredBlocks = getBlockLibraryByCategory(selectedCategory);

  return (
    <div className="w-80 bg-white border-r border-gray-200 h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Content Blocks</h3>
        <p className="text-sm text-gray-600">Drag blocks to the canvas to build your template</p>
      </div>

      {/* Category Tabs */}
      <div className="flex border-b border-gray-200">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              selectedCategory === category.id
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <span className="mr-2">{category.icon}</span>
            {category.name}
          </button>
        ))}
      </div>

      {/* Blocks List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredBlocks.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 text-4xl mb-2">📦</div>
            <p className="text-gray-600 text-sm">No blocks in this category</p>
          </div>
        ) : (
          filteredBlocks.map((block) => (
            <DraggableBlock key={block.type} block={block} />
          ))
        )}
      </div>

      {/* Quick Actions */}
      <div className="p-4 border-t border-gray-200">
        <div className="space-y-2">
          <button
            onClick={() => onBlockSelect?.('text')}
            className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Add Text Block
          </button>
          <button
            onClick={() => onBlockSelect?.('image')}
            className="w-full px-3 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            + Add Image
          </button>
        </div>
      </div>
    </div>
  );
};

export default BlockLibrary;
