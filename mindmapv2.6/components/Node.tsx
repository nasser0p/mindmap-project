import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
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
  glowSeverity: 'high' | 'low' | null;
  isSearchResult: boolean;
  isCurrentSearchResult: boolean;
  startInEditMode: boolean;
  originalChildrenCount: number;
  theme: 'light' | 'dark';
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onEditComplete: () => void;
  onSizeChange: (id: string, size: { width: number; height: number }) => void;
  onStartLinkDraw: (nodeId: string) => void;
  onRemoveImage: (nodeId: string) => void;
  onViewImage: (downloadURL: string) => void;
  onShowContextMenu: (nodeId: string, x: number, y: number) => void;
}

const nodeWidth = 220;
const minNodeHeight = 52;
const LOUPE_SIZE = 100;
const LOUPE_SCALE = 1.5;
const LONG_PRESS_DELAY = 400; // ms
const POINTER_MOVE_THRESHOLD = 10; // pixels

// Helper function to find word boundaries for double-click selection
const findWordBoundaries = (text: string, index: number) => {
    if (!text || index < 0 || index > text.length) {
        return { start: index, end: index };
    }
    let start = index;
    let end = index;
    // Find start of the word
    while (start > 0 && /\S/.test(text[start - 1])) {
        start--;
    }
    // Find end of the word
    while (end < text.length && /\S/.test(text[end])) {
        end++;
    }
    return { start, end };
};

const TextLoupe: React.FC<{
    text: string;
    cursorIndex: number;
    pointerPosition: { x: number; y: number };
    targetStyles: { font: string; color: string; lineHeight: string };
}> = ({ text, cursorIndex, pointerPosition, targetStyles }) => {
    const textRef = useRef<HTMLSpanElement>(null);
    const [textOffset, setTextOffset] = useState(0);

    useLayoutEffect(() => {
        if (textRef.current) {
            // Measure the width of the text up to the cursor index
            const preCursorText = text.substring(0, cursorIndex);
            const tempSpan = document.createElement('span');
            tempSpan.style.font = targetStyles.font;
            tempSpan.style.visibility = 'hidden';
            tempSpan.style.position = 'absolute';
            tempSpan.innerText = preCursorText;
            document.body.appendChild(tempSpan);
            const preCursorWidth = tempSpan.offsetWidth;
            document.body.removeChild(tempSpan);
            
            // Calculate the offset to center the cursor in the loupe
            setTextOffset(preCursorWidth);
        }
    }, [text, cursorIndex, targetStyles.font]);

    const loupeStyle: React.CSSProperties = {
        position: 'fixed',
        width: `${LOUPE_SIZE}px`,
        height: `${LOUPE_SIZE}px`,
        top: pointerPosition.y - LOUPE_SIZE - 20, // Position above the finger
        left: pointerPosition.x - LOUPE_SIZE / 2,
        borderRadius: '50%',
        border: '3px solid #3b82f6', // blue-500
        backgroundColor: 'white',
        overflow: 'hidden',
        boxShadow: '0 10px 20px rgba(0,0,0,0.2)',
        pointerEvents: 'none',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    };

    const contentStyle: React.CSSProperties = {
        transform: `translateX(-${textOffset * LOUPE_SCALE - LOUPE_SIZE / 2}px) scale(${LOUPE_SCALE})`,
        ...targetStyles,
        whiteSpace: 'pre', // Preserve whitespace
        transformOrigin: 'left center',
    };

    return (
        <div style={loupeStyle}>
            <span ref={textRef} style={contentStyle}>
                {text}
            </span>
        </div>
    );
};


const Node: React.FC<NodeProps> = (props) => {
  const { 
    d3Node, nodeData, depth, x, y, transform, isSelected, isBeingDragged, glowSeverity, 
    isSearchResult, isCurrentSearchResult, startInEditMode,
    originalChildrenCount, theme, onUpdate, onDelete, onToggleCollapse, onEditComplete,
    onSizeChange, onStartLinkDraw, onRemoveImage, onViewImage,
    onShowContextMenu
  } = props;
  
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(nodeData.text);
  const nodeRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [size, setSize] = useState({ width: nodeWidth, height: minNodeHeight });
  
  const [loupeState, setLoupeState] = useState<{
      visible: boolean;
      pointerPosition: { x: number; y: number };
      cursorIndex: number;
  } | null>(null);

  const longPressTimerRef = useRef<number | null>(null);
  const initialPointerPosRef = useRef<{ x: number, y: number } | null>(null);
  
  // State for the text-specific context menu
  const [isTextMenuOpen, setIsTextMenuOpen] = useState(false);
  const [textMenuPosition, setTextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const textMenuRef = useRef<HTMLDivElement>(null);

  // Timer for click differentiation
  const singleClickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (nodeRef.current) {
      (nodeRef.current as any).__data__ = d3Node;
    }
  }, [d3Node]);
  
  const { id, color, attachments, image, masteryScore } = nodeData;
  const isRoot = depth === 0;
  
  useLayoutEffect(() => {
    if (nodeRef.current && !isEditing) {
      const newHeight = Math.max(minNodeHeight, nodeRef.current.scrollHeight);
      if (size.height !== newHeight) {
          const newSize = { width: nodeWidth, height: newHeight };
          setSize(newSize);
          onSizeChange(id, newSize);
      }
    }
  }, [text, isEditing, nodeData.text, size.height, onSizeChange, id, image]);

  useLayoutEffect(() => {
    if (isEditing && textareaRef.current) {
        const el = textareaRef.current;
        // This pattern ensures the textarea adapts to its content's height
        // immediately upon being rendered.
        el.style.height = 'auto'; 
        el.style.height = `${el.scrollHeight}px`;
    }
  }, [isEditing]);

  const attachmentCount = attachments?.length || 0;
  
  const enterEditMode = useCallback((options: { selectionStart?: number; selectionEnd?: number; selectAll?: boolean } = {}) => {
    setIsEditing(true);
    setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        if (options.selectAll) {
            el.select();
        } else if (options.selectionStart !== undefined && options.selectionEnd !== undefined) {
            el.setSelectionRange(options.selectionStart, options.selectionEnd);
        } else {
            el.setSelectionRange(text.length, text.length); // Default: cursor at end
        }
    }, 0);
  }, [text]);

  useEffect(() => {
    // This effect handles the initial transition into edit mode.
    // It runs only when `startInEditMode` prop becomes true, preventing
    // the text from being re-selected on every character typed.
    if (startInEditMode) {
      setIsEditing(true);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.select();
        }
      }, 0);
    }
  }, [startInEditMode]);

  useEffect(() => {
    if(!isEditing) {
      setText(nodeData.text);
    }
  }, [nodeData.text, isEditing]);

    // Click outside handler for the new text menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (textMenuRef.current && !textMenuRef.current.contains(event.target as Node)) {
                setIsTextMenuOpen(false);
            }
        };

        if (isTextMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isTextMenuOpen]);

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
    e.stopPropagation();
    onShowContextMenu(id, e.clientX, e.clientY);
  };
  
  // --- Loupe Handlers ---
  const handlePointerDown = (e: React.PointerEvent<HTMLTextAreaElement>) => {
      if (e.pointerType !== 'touch') return;
      initialPointerPosRef.current = { x: e.clientX, y: e.clientY };
      
      longPressTimerRef.current = window.setTimeout(() => {
          const el = textareaRef.current;
          if (!el) return;
          setLoupeState({
              visible: true,
              pointerPosition: initialPointerPosRef.current!,
              cursorIndex: el.selectionStart
          });
          navigator.vibrate?.(50);
          el.blur(); // Hide the native cursor/selection handles
      }, LONG_PRESS_DELAY);
  };
  
  const handlePointerMove = (e: React.PointerEvent<HTMLTextAreaElement>) => {
      if (e.pointerType !== 'touch') return;
      
      if (longPressTimerRef.current && initialPointerPosRef.current) {
          const dx = e.clientX - initialPointerPosRef.current.x;
          const dy = e.clientY - initialPointerPosRef.current.y;
          if (Math.sqrt(dx * dx + dy * dy) > POINTER_MOVE_THRESHOLD) {
              window.clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
          }
      }

      if (loupeState?.visible) {
          e.preventDefault();
          e.stopPropagation();
          const el = textareaRef.current;
          if (!el) return;
          
          let newCursorIndex = 0;
          // Fix: Cast document to any to access non-standard browser API without TypeScript errors.
          if ((document as any).caretPositionFromPoint) {
              const range = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
              if (range) newCursorIndex = range.offset;
          } else {
             // Fallback for older browsers
             newCursorIndex = el.selectionStart;
          }
          
          el.setSelectionRange(newCursorIndex, newCursorIndex);

          setLoupeState({
              visible: true,
              pointerPosition: { x: e.clientX, y: e.clientY },
              cursorIndex: newCursorIndex
          });
      }
  };
  
  const handlePointerUp = (e: React.PointerEvent<HTMLTextAreaElement>) => {
      if (e.pointerType !== 'touch') return;
      if (longPressTimerRef.current) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
      }
      if (loupeState?.visible) {
          textareaRef.current?.focus(); // Refocus to bring back native cursor
      }
      setLoupeState(null);
  };

  const hasToggle = !isRoot && originalChildrenCount > 0;
  const animatedStrokeColor = isSelected ? '#3b82f6' : color;
  const strokeWidth = isSelected || glowSeverity || isCurrentSearchResult ? 2.5 : 2;
  const cursorStyle = isRoot ? 'pointer' : 'grab';
  
  const getBoxShadow = () => {
    if (isBeingDragged) {
      return '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
    }
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
    // The default shadow is provided by the .glass-effect class now.
    return undefined;
  };

  const getTransition = (): Transition => {
    let boxShadowTransition: Transition = { duration: 0.2 };

    if (isCurrentSearchResult || glowSeverity) {
        boxShadowTransition = {
            duration: isCurrentSearchResult ? 1.5 : 1.2,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: 'easeInOut'
        };
    }
    
    return {
        x: { duration: 0 },
        y: { duration: 0 },
        scale: { duration: 0 }, // Scale should be instant with zoom
        borderColor: { duration: 0.2 },
        borderWidth: { duration: 0.2 },
        boxShadow: boxShadowTransition,
        backgroundColor: { duration: 0.5, ease: 'easeInOut' }
    }
  };
  
  const screenX = x * transform.k + transform.x - (size.width / 2);
  const screenY = y * transform.k + transform.y - (size.height / 2);
  
  const scale = transform.k * (isBeingDragged ? 1.05 : 1);
  const finalClassName = `node-group absolute mind-map-node-draggable-part rounded-3xl flex flex-col items-center justify-center glass-effect`;

  const masteryBgColor = isRoot ? undefined : getMasteryBackgroundColor(masteryScore, theme);

  return (
    <>
    <motion.div
      ref={nodeRef}
      className={finalClassName}
      data-node-id={id}
      style={{
        width: size.width,
        height: size.height,
        pointerEvents: 'auto',
        transformOrigin: 'center center',
        padding: '12px 16px',
        boxSizing: 'border-box',
        cursor: cursorStyle,
        touchAction: 'none',
        borderStyle: 'solid',
        backgroundColor: masteryBgColor, // This will override the glass-effect background if present
      }}
      animate={{
        x: screenX,
        y: screenY,
        scale,
        borderWidth: `${strokeWidth}px`,
        borderColor: animatedStrokeColor,
        boxShadow: getBoxShadow(),
        backgroundColor: masteryBgColor,
      }}
      transition={getTransition()}
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
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                className={`w-full bg-transparent text-slate-800 dark:text-slate-100 font-medium focus:outline-none resize-none overflow-y-auto break-words ${image ? 'text-center' : 'text-left'}`}
                style={{
                  minHeight: `${minNodeHeight - 26}px`,
                  maxHeight: '250px',
                  fontSize: '15px',
                }}
                rows={1}
            />
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
            <p 
                ref={textRef}
                className={`font-medium text-slate-800 dark:text-slate-100 select-none w-full break-words ${image ? 'text-center' : 'text-left'}`} 
                style={{ fontSize: '15px', cursor: 'text' }}
            >
              {text}
            </p>
          </>
        )}

        {hasToggle && (
            <motion.button 
                className="absolute top-1/2 -translate-y-1/2 -left-3 w-6 h-6 cursor-pointer opacity-60 hover:opacity-100 transition-opacity node-toggle-button rounded-full flex items-center justify-center border-2 border-white dark:border-slate-700" 
                style={{ backgroundColor: color }}
                onClick={handleToggleClick} 
                onMouseDown={handleToggleMouseDown}
            >
                <span className="font-bold select-none pointer-events-none text-white text-sm">{nodeData.isCollapsed ? originalChildrenCount : '−'}</span>
            </motion.button>
        )}

        {!isRoot && (
            <motion.button 
                className="absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-6 connector-handle cursor-crosshair opacity-50 hover:opacity-100 transition-opacity rounded-full flex items-center justify-center border-2 border-white dark:border-slate-700"
                style={{ backgroundColor: color }}
                onMouseDown={handleConnectorMouseDown} 
                title="Drag to connect to another node"
            >
                <span className="font-bold select-none pointer-events-none text-white text-sm">+</span>
            </motion.button>
        )}
    </motion.div>

    <AnimatePresence>
        {isTextMenuOpen && textMenuPosition && (
            <motion.div
                ref={textMenuRef}
                className="fixed z-50 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-lg shadow-xl border border-slate-200/80 dark:border-slate-700/80 p-1"
                style={{
                    top: textMenuPosition.y + 10,
                    left: textMenuPosition.x,
                }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.1 }}
            >
                <button
                    onClick={() => {
                        enterEditMode({ selectAll: true });
                        setIsTextMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md"
                >
                    <i className="fa-solid fa-i-cursor w-4 text-center"></i>
                    <span>Select All</span>
                </button>
            </motion.div>
        )}
    </AnimatePresence>

    <AnimatePresence>
        {loupeState?.visible && textareaRef.current && (
             <TextLoupe 
                text={text}
                cursorIndex={loupeState.cursorIndex}
                pointerPosition={loupeState.pointerPosition}
                targetStyles={{
                    font: window.getComputedStyle(textareaRef.current).font,
                    color: window.getComputedStyle(textareaRef.current).color,
                    lineHeight: window.getComputedStyle(textareaRef.current).lineHeight,
                }}
            />
        )}
    </AnimatePresence>
    </>
  );
};

export default React.memo(Node);