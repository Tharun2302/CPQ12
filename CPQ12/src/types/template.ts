export interface ContentBlock {
  id: string;
  type: BlockType;
  content: any;
  position: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
  style: BlockStyle;
  isSelected: boolean;
  isDragging: boolean;
}

export type BlockType = 
  | 'header'
  | 'text'
  | 'image'
  | 'table'
  | 'signature'
  | 'quote-details'
  | 'cost-breakdown'
  | 'footer'
  | 'spacer'
  | 'divider';

export interface BlockStyle {
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  padding?: number;
  margin?: number;
  textAlign?: 'left' | 'center' | 'right';
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  blocks: ContentBlock[];
  createdAt: Date;
  updatedAt: Date;
  isDefault?: boolean;
  thumbnail?: string;
}

export interface BlockLibraryItem {
  type: BlockType;
  name: string;
  description: string;
  icon: string;
  defaultContent: any;
  defaultStyle: BlockStyle;
  category: 'basic' | 'quote' | 'advanced';
}

export interface DragItem {
  type: 'block' | 'existing-block';
  blockType?: BlockType;
  blockId?: string;
  source: 'library' | 'canvas';
}
