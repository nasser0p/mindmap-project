import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { HierarchyPointNode } from 'd3-hierarchy';
import { motion, Transition, AnimatePresence } from 'framer-motion';
import { MindMapNode as MindMapNodeData } from '../types';
import { ZoomTransform } from 'd3-zoom';
import { getMasteryBackgroundColor } from '../constants';

interface NodeProps {
  d3Node: HierarchyPointNode<MindMapNodeData>; // Passed for d3 integration in parent
  nodeData: MindMapNodeData;
  depth: number;
  x: number;
  y: number;
  transform: ZoomTransform;
  isSelected: boolean;
  isBeingDragged: boolean;
  isDropTarget: boolean;
  isPastingImage: boolean;
  glowSeverity: 'high' | 'low' | null;
  isSearchResult: boolean;
  isCurrentSearchResult: boolean;
  startInEditMode: boolean;
  originalChildrenCount: number;
  theme: 'light' | 'dark';
  onSelect: (id: string, event: React.MouseEvent) => void;
  onUpdate: (id: string, text: string) => void;
  onUpdateNodeSize: (id: string, width: number, height: number) => void;
  onNodePositionUpdate: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onEditComplete: () => void;
  onSizeChange: (id: string, size: { width: number; height: number }) => void;
  onStartLinkDraw: (nodeId: string) => void;
  onShowAttachments: (nodeId: string) => void;
  onRemoveImage: (nodeId: string) => void;
  onViewImage: (downloadURL: string) => void;
  onShowContextMenu: (nodeId: string, x: number, y: number) => void;
}

const defaultNodeWidth = 220;
const minNodeWidth = 120;
const minNodeHeight = 52;

const Node: React.FC<NodeProps> = (props) => {
  const { 
    d3Node, nodeData, depth, x, y, transform, isSelected, isBeingDragged, isDropTarget, isPastingImage, glowSeverity, 
    isSearchResult, isCurrentSearchResult, startInEditMode,
    originalChildrenCount, theme, onSelect, onUpdate, onUpdateNodeSize, onNodePositionUpdate, onDelete, onToggleCollapse, onEditComplete,
    onSizeChange, onStartLinkDraw, onShowAttachments, onRemoveImage, onViewImage,
    onShowContextMenu
  } = props;
  
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const [text, setText] = useState(nodeData.text);
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [localNodeCenter, setLocalNodeCenter] = useState<{ x: number, y: number } | null>(null);
  const prevNodeTextRef = useRef(nodeData.text);
  
  const [size, setSize] = useState({
    width: nodeData.width || defaultNodeWidth,
    height: nodeData.height || minNodeHeight,
  });

  const { id, color, attachments, image, masteryScore } = nodeData;
  
  useEffect(() => {
    setSize({
        width: nodeData.width || defaultNodeWidth,
        height: nodeData.height || minNodeHeight,
    });
  }, [nodeData.width, nodeData.height]);
  
  useLayoutEffect(() => {
    const nodeEl = nodeRef.current;
    // If resizing, or the node isn't rendered yet, just report current size and exit.
    if (isResizing || !nodeEl) {
        onSizeChange(id, size);
        return;
    }

    // Calculate the actual height required by the content.
    let requiredHeight = Math.max(minNodeHeight, nodeEl.scrollHeight);
    // FIX: When entering edit mode, prevent the node from shrinking. It should
    // only be allowed to grow if the text content requires more space.
    if (isEditing) {
        requiredHeight = Math.max(requiredHeight, size.height);
    }
    
    const hasRenderedHeightChanged = Math.abs(size.height - requiredHeight) > 1;
    const isPersistedHeightCorrect = nodeData.height !== undefined && Math.abs(nodeData.height - requiredHeight) <= 1;

    // 1. Update local state for immediate visual feedback if the rendered size is wrong.
    if (hasRenderedHeightChanged) {
        const newSize = { width: size.width, height: requiredHeight };
        setSize(newSize);
        onSizeChange(id, newSize);
    } else {
        onSizeChange(id, size);
    }
    
    // 2. Persist the correct height to the database if it's not already correct there.
    // This handles both initial sizing and updates after text edits.
    if (!isPersistedHeightCorrect) {
        onUpdateNodeSize(id, size.width, requiredHeight);
    }
}, [
    nodeData.text, 
    nodeData.height,
    image, 
    size.width, 
    size.height,
    id, 
    onSizeChange, 
    onUpdateNodeSize,
    isEditing, 
    isResizing
]);

  useEffect(() => {
    if (nodeRef.current) {
      (nodeRef.current as any).__data__ = d3Node;
    }
  }, [d3Node]);
  
  const isRoot = depth === 0;
  const attachmentCount = attachments?.length || 0;

  useEffect(() => {
    // This effect synchronizes the local text state with the incoming prop `nodeData.text`.
    // It's designed to handle external updates (like AI actions or undo/redo) without
    // interfering with the user's input during editing.
    
    // The `useRef` tracks the previous prop value. We only update the local state if:
    // 1. We are NOT in editing mode.
    // 2. The prop value has actually changed since the last render.
    // This combination prevents the bug where user input was reverted immediately upon
    // finishing an edit, because it stops the effect from running on the re-render
    // triggered by `setIsEditing(false)`.
    if (!isEditing && nodeData.text !== prevNodeTextRef.current) {
        setText(nodeData.text);
    }
    // Always update the ref to the latest prop value for the next comparison.
    prevNodeTextRef.current = nodeData.text;
  }, [nodeData.text, isEditing]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();

      if (cursorPosition !== null) {
        setTimeout(() => {
            el.setSelectionRange(cursorPosition, cursorPosition);
            setCursorPosition(null); // Reset after use
        }, 0);
      }

      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [isEditing, cursorPosition]);
  
  useEffect(() => {
    if (startInEditMode) {
      setIsEditing(true);
    }
  }, [startInEditMode]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    let pos = null;
    if ((document as any).caretPositionFromPoint) {
        const range = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
        if (range && range.offsetNode?.nodeType === window.Node.TEXT_NODE) {
            pos = range.offset;
        }
    } else if ((document as any).caretRangeFromPoint) {
        const range = (document as any).caretRangeFromPoint(e.clientX, e.clientY);
        if (range && range.startContainer?.nodeType === window.Node.TEXT_NODE) {
            pos = range.startOffset;
        }
    }
    setCursorPosition(pos);
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
  
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onShowContextMenu(id, e.clientX, e.clientY);
  };

  const handleResizeStart = useCallback((startEvent: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    startEvent.stopPropagation();
    setIsResizing(true);

    const isTouchEvent = 'touches' in startEvent;
    const startClientX = isTouchEvent ? startEvent.touches[0].clientX : startEvent.clientX;
    const startClientY = isTouchEvent ? startEvent.touches[0].clientY : startEvent.clientY;
    const startWidth = size.width;
    const startHeight = size.height;
    const startNodeX = x;
    const startNodeY = y;

    const handleResizeMove = (moveEvent: MouseEvent | TouchEvent) => {
        const moveClientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const moveClientY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
        
        const dx = (moveClientX - startClientX);
        const dy = (moveClientY - startClientY);

        const worldDx = dx / transform.k;
        const worldDy = dy / transform.k;

        const newWidth = Math.max(minNodeWidth, startWidth + worldDx);
        const newHeight = Math.max(minNodeHeight, startHeight + worldDy);

        const dw = newWidth - startWidth;
        const dh = newHeight - startHeight;

        const newCenterX = startNodeX + dw / 2;
        const newCenterY = startNodeY + dh / 2;

        setSize({ width: newWidth, height: newHeight });
        setLocalNodeCenter({ x: newCenterX, y: newCenterY });
    };

    const handleResizeEnd = () => {
        setIsResizing(false);
        
        setSize(currentSize => {
            setLocalNodeCenter(currentCenter => {
                const finalCenter = currentCenter || { x, y };
                onUpdateNodeSize(id, currentSize.width, currentSize.height);
                onNodePositionUpdate(id, finalCenter.x, finalCenter.y);
                
                setLocalNodeCenter(null);
                return null;
            });
            return currentSize;
        });

        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
        window.removeEventListener('touchmove', handleResizeMove);
        window.removeEventListener('touchend', handleResizeEnd);
    };
    
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
    window.addEventListener('touchmove', handleResizeMove);
    window.addEventListener('touchend', handleResizeEnd);

  }, [id, x, y, size.width, size.height, onUpdateNodeSize, onNodePositionUpdate, transform.k]);

  const hasToggle = !isRoot && originalChildrenCount > 0;
  const strokeColor = isSelected ? '#3b82f6' : color;
  const animatedStrokeColor = isDropTarget ? '#0ea5e9' : strokeColor;
  const strokeWidth = isSelected || isDropTarget || glowSeverity || isCurrentSearchResult ? 2.5 : 2;
  const cursorStyle = isRoot ? 'pointer' : 'grab';

  const textAlignClass = image ? 'text-center' : 'text-left';
  const sharedTextClasses = `font-medium text-slate-800 dark:text-slate-100 w-full break-words ${textAlignClass}`;
  const sharedTextStyles: React.CSSProperties = { fontSize: '15px', lineHeight: 1.5, };
  
  const getBoxShadow = () => {
    if (isBeingDragged) return '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
    if (isCurrentSearchResult) return ['0 0 12px 2px rgba(59, 130, 246, 0.6)', '0 0 20px 6px rgba(59, 130, 246, 0.3)', '0 0 12px 2px rgba(59, 130, 246, 0.6)'];
    if (glowSeverity === 'high') return ['0 0 12px 2px rgba(239, 68, 68, 0.7)', '0 0 20px 6px rgba(239, 68, 68, 0.4)', '0 0 12px 2px rgba(239, 68, 68, 0.7)'];
    if (glowSeverity === 'low') return ['0 0 12px 2px rgba(245, 158, 11, 0.7)', '0 0 20px 6px rgba(245, 158, 11, 0.4)', '0 0 12px 2px rgba(245, 158, 11, 0.7)'];
    if (isSearchResult) return '0 0 10px 1px rgba(245, 158, 11, 0.6)';
    if (isDropTarget) return `0 0 12px 2px ${animatedStrokeColor}99`;
    return '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)';
  };

  const getTransition = (): Transition => {
    let boxShadowTransition: Transition = { duration: 0.2 };
    if (isCurrentSearchResult || glowSeverity) {
        boxShadowTransition = { duration: isCurrentSearchResult ? 1.5 : 1.2, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' };
    }
    return { x: { duration: 0 }, y: { duration: 0 }, scale: { duration: 0 }, width: { duration: 0 }, height: { duration: 0 }, borderColor: { duration: 0.2 }, borderWidth: { duration: 0.2 }, boxShadow: boxShadowTransition, backgroundColor: { duration: 0.5, ease: 'easeInOut' } }
  };
  
  const renderX = localNodeCenter?.x ?? x;
  const renderY = localNodeCenter?.y ?? y;

  const screenX = renderX * transform.k + transform.x - (size.width / 2);
  const screenY = renderY * transform.k + transform.y - (size.height / 2);
  
  const scale = transform.k * (isBeingDragged ? 1.05 : 1);
  const finalClassName = `node-group absolute mind-map-node-draggable-part rounded-3xl flex flex-col items-center justify-start ${isRoot ? 'bg-blue-50 dark:bg-slate-800' : 'bg-white dark:bg-slate-700'}`;

  const masteryBgColor = isRoot ? undefined : getMasteryBackgroundColor(masteryScore, theme);
  const zIndex = isBeingDragged ? 15 : 10;

  return (
    <motion.div
      ref={nodeRef}
      className={finalClassName}
      data-node-id={id}
      style={{
        pointerEvents: 'auto',
        transformOrigin: 'center center',
        padding: image ? '24px 16px' : '12px 16px',
        boxSizing: 'border-box',
        cursor: cursorStyle,
        borderStyle: isResizing ? 'dashed' : 'solid',
        overflow: 'visible',
        backgroundColor: masteryBgColor,
        zIndex,
        touchAction: 'none',
      }}
      animate={{
        x: screenX,
        y: screenY,
        width: size.width,
        height: size.height,
        scale,
        borderWidth: `${strokeWidth}px`,
        borderColor: animatedStrokeColor,
        boxShadow: getBoxShadow(),
        backgroundColor: masteryBgColor,
      }}
      transition={getTransition()}
      onDoubleClick={handleDoubleClick}
      onClick={(e) => onSelect(id, e)}
      onContextMenu={handleContextMenu}
    >
        {isEditing ? (
          <>
            {image && <img src={image.downloadURL} className="max-h-32 w-auto rounded-lg mb-2 object-contain pointer-events-none" alt="" />}
            <textarea
                ref={textareaRef}
                value={text}
                onChange={handleTextChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                className={`${sharedTextClasses} bg-transparent focus:outline-none resize-none overflow-hidden p-0 border-0`}
                style={{ ...sharedTextStyles, minHeight: `${minNodeHeight - 26}px` }}
            />
          </>
        ) : (
          <>
            {image ? (
              <div className="relative group/image mb-2 cursor-zoom-in" onClick={(e) => { e.stopPropagation(); onViewImage(image.downloadURL); }} title="Click to expand image" >
                <img src={image.downloadURL} className="max-h-36 w-auto rounded-lg object-contain pointer-events-none" alt="Node content" />
                <button onClick={(e) => { e.stopPropagation(); onRemoveImage(id); }} className="absolute top-1 right-1 w-6 h-6 bg-slate-800/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover/image:opacity-100 hover:bg-slate-900/80 transition-opacity" title="Remove image" >
                  <i className="fa-solid fa-times" style={{fontSize: '12px'}}></i>
                </button>
              </div>
            ) : null}
            <p className={`${sharedTextClasses} select-none pointer-events-none`} style={sharedTextStyles}>{text}</p>
          </>
        )}

        {hasToggle && (
            <div className="absolute top-1/2 -translate-y-1/2 -left-5 w-10 h-10 flex items-center justify-center" onClick={handleToggleClick} onMouseDown={handleToggleMouseDown} >
                <motion.div className="w-6 h-6 cursor-pointer opacity-60 hover:opacity-100 transition-opacity node-toggle-button rounded-full flex items-center justify-center border-2 border-white dark:border-slate-700" style={{ backgroundColor: color }} >
                    <span className="font-bold select-none pointer-events-none text-white text-sm">{nodeData.isCollapsed ? originalChildrenCount : '−'}</span>
                </motion.div>
            </div>
        )}

        {!isRoot && (
            <div className="absolute top-1/2 -translate-y-1/2 -right-5 w-10 h-10 flex items-center justify-center" onMouseDown={handleConnectorMouseDown} >
                <motion.div className="w-6 h-6 connector-handle cursor-crosshair opacity-50 hover:opacity-100 transition-opacity rounded-full flex items-center justify-center border-2 border-white dark:border-slate-700" style={{ backgroundColor: color }} title="Drag to connect to another node" >
                    <span className="font-bold select-none pointer-events-none text-white text-sm">+</span>
                </motion.div>
            </div>
        )}

      {attachmentCount > 0 && (
        <motion.button
          className="absolute -top-2 -right-2 w-6 h-6 cursor-pointer opacity-80 hover:opacity-100 transition-opacity attachment-button bg-white dark:fill-slate-700 rounded-full flex items-center justify-center border-2"
          style={{ borderColor: color }}
          onClick={(e) => { e.stopPropagation(); onShowAttachments(id); }}
          onMouseDown={(e) => e.stopPropagation()}
          whileHover={{ scale: 1.2 }}
          title={`${attachmentCount} attachment${attachmentCount > 1 ? 's' : ''}. Click to view.`}
        >
            <i className="fa-solid fa-paperclip text-xs text-slate-500 dark:text-slate-300"></i>
        </motion.button>
      )}

        <AnimatePresence>
            {isPastingImage && (
                <motion.div className="absolute inset-0 bg-slate-800/50 rounded-2xl flex flex-col items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} >
                    <i className="fa-solid fa-spinner fa-spin text-2xl text-white"></i>
                    <p className="text-white text-sm font-semibold mt-2">Pasting...</p>
                </motion.div>
            )}
        </AnimatePresence>
        
        {isSelected && !isEditing && (
            <div
                className="absolute -bottom-1 -right-1 w-5 h-5 cursor-se-resize node-resize-handle"
                onMouseDown={handleResizeStart}
                onTouchStart={handleResizeStart}
                title="Resize node"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    <path d="M20 20L12 20M20 20L20 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </div>
        )}
    </motion.div>
  );
};

export default React.memo(Node);