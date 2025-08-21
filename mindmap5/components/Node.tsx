import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { HierarchyPointNode } from 'd3-hierarchy';
import { motion, Transition } from 'framer-motion';
import { MindMapNode as MindMapNodeData } from '../types';

interface NodeProps {
  d3Node: HierarchyPointNode<MindMapNodeData>; // Passed for d3 integration in parent
  nodeData: MindMapNodeData;
  depth: number;
  x: number;
  y: number;
  isSelected: boolean;
  isBeingDragged: boolean;
  isDropTarget: boolean;
  glowSeverity: 'high' | 'low' | null;
  isSearchResult: boolean;
  isCurrentSearchResult: boolean;
  startInEditMode: boolean;
  originalChildrenCount: number;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onEditComplete: () => void;
  onSizeChange: (id: string, size: { width: number; height: number }) => void;
  onStartLinkDraw: (nodeId: string) => void;
  onShowAttachments: (nodeId: string) => void;
  onRemoveImage: (nodeId: string) => void;
  onViewImage: (downloadURL: string) => void;
}

const nodeWidth = 220;
const minNodeHeight = 52;

const Node: React.FC<NodeProps> = (props) => {
  const { 
    d3Node, nodeData, depth, x, y, isSelected, isBeingDragged, isDropTarget, glowSeverity, 
    isSearchResult, isCurrentSearchResult, startInEditMode,
    originalChildrenCount, onSelect, onUpdate, onDelete, onToggleCollapse, onEditComplete,
    onSizeChange, onStartLinkDraw, onShowAttachments, onRemoveImage, onViewImage
  } = props;
  
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const [text, setText] = useState(nodeData.text);
  const nodeRef = useRef<SVGGElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [size, setSize] = useState({ width: nodeWidth, height: minNodeHeight });
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // This is necessary for d3-drag and d3-zoom to function correctly,
    // as they rely on data being attached to the DOM elements.
    if (nodeRef.current) {
      (nodeRef.current as any).__data__ = d3Node;
    }
  }, [d3Node]);
  
  const { id, color, attachments, image } = nodeData;
  const isRoot = depth === 0;
  
  useLayoutEffect(() => {
      if (contentRef.current) {
          contentRef.current.style.height = 'auto';
          const newHeight = Math.max(minNodeHeight, contentRef.current.scrollHeight);
          if (size.height !== newHeight) {
              const newSize = { width: nodeWidth, height: newHeight };
              contentRef.current.style.height = `${newHeight}px`;
              setSize(newSize);
              onSizeChange(id, newSize);
          }
      }
  }, [text, isEditing, nodeData.text, size.height, onSizeChange, id, image]);

  const attachmentCount = attachments?.length || 0;

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.select();
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [isEditing]);
  
  useEffect(() => {
    if (startInEditMode) {
      setIsEditing(true);
    }
  }, [startInEditMode]);

  useEffect(() => {
    if(!isEditing) {
      setText(nodeData.text);
    }
  }, [nodeData.text, isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleBlur = () => {
    if (text.trim() === '' && !image) {
        onDelete(id);
    } else if (text !== nodeData.text) {
        onUpdate(id, text);
    }
    setIsEditing(false);
    onEditComplete();
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    } else if (e.key === 'Escape') {
      setText(nodeData.text);
      setIsEditing(false);
      onEditComplete();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
  }
  
  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleCollapse(id);
  };

  const handleToggleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleConnectorMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStartLinkDraw(id);
  }

  const hasToggle = !isRoot && originalChildrenCount > 0;
  const strokeColor = isSelected ? '#3b82f6' : color;
  const animatedStrokeColor = isDropTarget ? '#0ea5e9' : strokeColor;
  const strokeWidth = isSelected || isDropTarget || glowSeverity || isCurrentSearchResult ? 2.5 : 2;
  const cursorStyle = isRoot ? 'pointer' : 'grab';
  
  const bodyVariants = {
      initial: { scale: 1, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)' },
      drag: { scale: 1.05, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' },
  };

  const getBoxShadowAnimate = () => {
    if (isCurrentSearchResult) {
        return ['0 0 12px 2px rgba(59, 130, 246, 0.6)', '0 0 20px 6px rgba(59, 130, 246, 0.3)', '0 0 12px 2px rgba(59, 130, 246, 0.6)'];
    }
    if (glowSeverity === 'high') {
        return ['0 0 12px 2px rgba(239, 68, 68, 0.7)', '0 0 20px 6px rgba(239, 68, 68, 0.4)', '0 0 12px 2px rgba(239, 68, 68, 0.7)'];
    }
     if (glowSeverity === 'low') {
        return ['0 0 12px 2px rgba(245, 158, 11, 0.7)', '0 0 20px 6px rgba(245, 158, 11, 0.4)', '0 0 12px 2px rgba(245, 158, 11, 0.7)'];
    }
    if (isSearchResult) {
        return '0 0 10px 1px rgba(245, 158, 11, 0.6)'; // amber-500
    }
    if (isDropTarget) {
        return `0 0 12px 2px ${animatedStrokeColor}99`;
    }
    return 'none';
  };

  const getBoxShadowTransition = (): Transition => {
    if (isCurrentSearchResult || isDropTarget || glowSeverity) {
        return {
            duration: isCurrentSearchResult ? 1.5 : 1.2,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: 'easeInOut'
        };
    }
    return { duration: 0.2 };
  };

  return (
    <g
      ref={nodeRef}
      className="node-group"
      transform={`translate(${x}, ${y})`}
      onDoubleClick={handleDoubleClick}
      onClick={(e) => onSelect(id, e)}
    >
      <foreignObject 
        x={-size.width / 2} 
        y={-size.height / 2} 
        width={size.width} 
        height={size.height} 
        style={{ overflow: 'visible' }}
      >
        <motion.div
          ref={contentRef}
          className={`mind-map-node-draggable-part rounded-3xl ${isRoot ? 'bg-blue-50 dark:bg-slate-800' : 'bg-white dark:bg-slate-700'}`}
          style={{ 
              width: `${nodeWidth}px`, 
              height: `${size.height}px`, 
              minHeight: `${minNodeHeight}px`, 
              cursor: cursorStyle, 
              padding: '12px 16px', 
              boxSizing: 'border-box', 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center', 
              justifyContent: 'center',
              touchAction: 'none'
          }}
          variants={bodyVariants}
          animate={isBeingDragged ? "drag" : "initial"}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <motion.div className="w-full h-full rounded-3xl absolute top-0 left-0" style={{ border: `${strokeWidth}px solid ${strokeColor}`, pointerEvents: 'none' }}
             animate={{ 
                borderColor: animatedStrokeColor, 
                boxShadow: getBoxShadowAnimate(),
             }}
             transition={{ 
                borderColor: { duration: 0.2 }, 
                boxShadow: getBoxShadowTransition(),
             }} />
          
            {isEditing ? (
              <>
                {image && <img src={image.downloadURL} className="max-h-32 w-auto rounded-lg mb-2 object-contain pointer-events-none" alt="" />}
                <textarea ref={textareaRef} value={text} onChange={handleTextChange} onBlur={handleBlur} onKeyDown={handleKeyDown} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} className="w-full bg-transparent text-slate-800 dark:text-slate-100 text-center font-medium focus:outline-none resize-none overflow-hidden" style={{ minHeight: `${minNodeHeight - 26}px` }} rows={1} />
              </>
            ) : (
              <>
                {image ? (
                  <div
                    className="relative group/image mb-2 cursor-zoom-in"
                    onClick={(e) => { e.stopPropagation(); onViewImage(image.downloadURL); }}
                    title="Click to expand image"
                  >
                    <img src={image.downloadURL} className="max-h-36 w-auto rounded-lg object-contain pointer-events-none" alt="Node content" />
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveImage(id); }}
                      className="absolute top-1 right-1 w-6 h-6 bg-slate-800/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover/image:opacity-100 hover:bg-slate-900/80 transition-opacity"
                      title="Remove image"
                    >
                      <i className="fa-solid fa-times" style={{fontSize: '12px'}}></i>
                    </button>
                  </div>
                ) : null}
                <p className={`font-medium text-slate-800 dark:text-slate-100 select-none pointer-events-none w-full break-words ${image ? 'text-center' : 'text-left'}`} style={{ fontSize: '15px' }}>
                  {text}
                </p>
              </>
            )}
        </motion.div>
      </foreignObject>

      {hasToggle && (
        <motion.g transform={`translate(${(-size.width / 2) + 12}, 0)`} className="cursor-pointer opacity-60 hover:opacity-100 transition-opacity node-toggle-button" onClick={handleToggleClick} onMouseDown={handleToggleMouseDown} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.95 }} >
            <circle r="10" fill={color} stroke="white" strokeWidth="2" className="dark:stroke-slate-700" />
            <text textAnchor="middle" dy=".35em" fill="white" className="font-bold select-none pointer-events-none" style={{fontSize: nodeData.isCollapsed ? '10px' : '12px'}}>{nodeData.isCollapsed ? originalChildrenCount : '−'}</text>
        </motion.g>
      )}

      {!isRoot && (
        <motion.g transform={`translate(${(size.width / 2) - 12}, 0)`} className="connector-handle cursor-crosshair opacity-50 hover:opacity-100 transition-opacity" onMouseDown={handleConnectorMouseDown} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.95 }}>
            <title>Drag to connect to another node</title>
            <circle r="10" fill={color} stroke="white" strokeWidth="2" className="dark:stroke-slate-700" />
            <text textAnchor="middle" dy=".35em" fill="white" className="font-bold select-none pointer-events-none" style={{fontSize: '12px'}}>+</text>
        </motion.g>
      )}

      {attachmentCount > 0 && (
        <motion.g
          transform={`translate(${size.width / 2 - 12}, ${-size.height / 2 + 12})`}
          className="cursor-pointer opacity-80 hover:opacity-100 transition-opacity attachment-button"
          onClick={(e) => { e.stopPropagation(); onShowAttachments(id); }}
          onMouseDown={(e) => e.stopPropagation()}
          whileHover={{ scale: 1.2 }}
        >
          <g>
            <title>{`${attachmentCount} attachment${attachmentCount > 1 ? 's' : ''}. Click to view.`}</title>
            <circle r="9" fill="white" stroke={color} strokeWidth="1.5" className="dark:fill-slate-700"/>
            <text textAnchor="middle" dy=".35em" fill="#475569" className="select-none pointer-events-none dark:fill-slate-300" style={{ fontSize: '10px' }}>
              <tspan className="fa-solid">&#xf0c6;</tspan>
            </text>
          </g>
        </motion.g>
      )}
    </g>
  );
};

export default React.memo(Node);