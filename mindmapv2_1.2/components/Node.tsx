import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { HierarchyPointNode } from 'd3-hierarchy';
import { motion, AnimatePresence, Transition, Variants } from 'framer-motion';
import { MindMapNode as MindMapNodeData } from '../types';
import { ZoomTransform } from 'd3-zoom';
import { getMasteryBackgroundColor } from '../constants';

interface NodeProps {
  d3Node: HierarchyPointNode<MindMapNodeData>;
  nodeData: MindMapNodeData;
  depth: number;
  x: number;
  y: number;
  transform: ZoomTransform;
  isSelected: boolean;
  isBeingDragged: boolean;
  isDropTarget: boolean;
  glowSeverity: 'high' | 'low' | null;
  isSearchResult: boolean;
  isCurrentSearchResult: boolean;
  startInEditMode: boolean;
  isEditingMode: boolean;
  originalChildrenCount: number;
  theme: 'light' | 'dark';
  onSelect: (id: string, event: React.MouseEvent) => void;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onStartEdit: (nodeId: string) => void;
  onEditComplete: () => void;
  onSizeChange: (id: string, size: { width: number; height: number }) => void;
  onStartLinkDraw: (nodeId: string) => void;
  onShowAttachments: (nodeId: string) => void;
  onRemoveImage: (nodeId: string) => void;
  onViewImage: (downloadURL: string) => void;
  onShowContextMenu: (nodeId: string, x: number, y: number) => void;
}

const nodeWidth = 220;
const minNodeHeight = 52;

// --- Helper functions for rich text editing ---
const markdownToHtml = (md: string): string => {
  if (!md) return '';
  return md
    .replace(/</g, "&lt;").replace(/>/g, "&gt;") // Basic sanitation
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
};

const htmlToMarkdown = (element: HTMLElement | null): string => {
  if (!element) return '';
  const clone = element.cloneNode(true) as HTMLElement;

  clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  clone.querySelectorAll('strong, b').forEach(b => b.replaceWith(`**${b.innerHTML}**`));
  clone.querySelectorAll('em, i').forEach(i => i.replaceWith(`*${i.innerHTML}*`));

  // Remove any other unwanted html tags, leaving text content
  clone.querySelectorAll(':not(strong):not(em):not(b):not(i)').forEach(el => {
    if (el.innerHTML) {
      el.replaceWith(el.innerHTML);
    }
  });

  return clone.innerText || '';
};

const popoverVariants: Variants = {
    hidden: { opacity: 0, y: 5, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1 },
};

const TextEditPopover: React.FC<{
    rect: DOMRect,
    transform: ZoomTransform,
    onCommand: (cmd: 'bold' | 'italic' | 'copy') => void,
    onPaste: () => void
}> = ({ rect, transform, onCommand, onPaste }) => {
    
    const popoverStyle: React.CSSProperties = {
        position: 'absolute',
        top: `${rect.top - 50}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translateX(-50%)',
        pointerEvents: 'auto',
        zIndex: 10,
    };

    const handleMouseDown = (e: React.MouseEvent) => e.preventDefault();

    return (
        <motion.div
            style={popoverStyle}
            variants={popoverVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
        >
            <div className="flex items-center gap-1 p-1 bg-slate-800 rounded-lg shadow-md">
                 <button onMouseDown={handleMouseDown} onClick={() => onCommand('bold')} className="w-8 h-8 flex items-center justify-center text-white/80 hover:bg-slate-700 rounded-md"><i className="fa-solid fa-bold"></i></button>
                 <button onMouseDown={handleMouseDown} onClick={() => onCommand('italic')} className="w-8 h-8 flex items-center justify-center text-white/80 hover:bg-slate-700 rounded-md"><i className="fa-solid fa-italic"></i></button>
                 <div className="w-px h-5 bg-slate-600 mx-1"></div>
                 <button onMouseDown={handleMouseDown} onClick={() => onCommand('copy')} className="w-8 h-8 flex items-center justify-center text-white/80 hover:bg-slate-700 rounded-md"><i className="fa-solid fa-copy"></i></button>
                 <button onMouseDown={handleMouseDown} onClick={onPaste} className="w-8 h-8 flex items-center justify-center text-white/80 hover:bg-slate-700 rounded-md"><i className="fa-solid fa-paste"></i></button>
            </div>
        </motion.div>
    );
};


const Node: React.FC<NodeProps> = (props) => {
  const { 
    d3Node, nodeData, depth, x, y, transform, isSelected, isBeingDragged, isDropTarget, glowSeverity, 
    isSearchResult, isCurrentSearchResult, startInEditMode, isEditingMode,
    originalChildrenCount, theme, onSelect, onUpdate, onDelete, onToggleCollapse, onStartEdit, onEditComplete,
    onSizeChange, onStartLinkDraw, onShowAttachments, onRemoveImage, onViewImage,
    onShowContextMenu
  } = props;
  
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const nodeRef = useRef<HTMLDivElement>(null);
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: nodeWidth, height: minNodeHeight });
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (nodeRef.current) {
      (nodeRef.current as any).__data__ = d3Node;
    }
  }, [d3Node]);
  
  const { id, color, attachments, image, masteryScore, text } = nodeData;
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

  const attachmentCount = attachments?.length || 0;
  
  const enterEditMode = (selectionLogic?: (el: HTMLElement) => void) => {
    if (isEditing || isRoot) return;
    onStartEdit(id);
    setIsEditing(true);
    setTimeout(() => { // Allow component to re-render with contentEditable
      const el = contentEditableRef.current;
      if (el) {
        el.focus();
        if (selectionLogic) {
          selectionLogic(el);
        }
      }
    }, 0);
  };
  
  const enterEditModeAtPoint = (clientX: number, clientY: number) => {
    enterEditMode(() => {
        const selection = window.getSelection();
        const range = document.caretRangeFromPoint(clientX, clientY);
        if (range && selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
    });
  };

  const enterEditModeAndSelect = (unit: 'word' | 'all') => {
    enterEditMode((el) => {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        if (unit === 'all') {
            range.selectNodeContents(el);
        } else {
            // A bit of a trick to select word under cursor
            selection.selectAllChildren(el);
            selection.collapseToEnd();
            selection.modify('move', 'backward', 'word');
            selection.modify('extend', 'forward', 'word');
            return;
        }
        selection.removeAllRanges();
        selection.addRange(range);
      }
    });
  };
  
  const enterEditModeAtEnd = () => {
    enterEditMode((el) => {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false); // to end
        selection?.removeAllRanges();
        selection?.addRange(range);
    });
  };
  
  useEffect(() => {
    if (isEditingMode && !isEditing) {
      enterEditModeAtEnd();
    }
  }, [isEditingMode, isEditing]);
  
  const handleBlur = () => {
    const newText = htmlToMarkdown(contentEditableRef.current);
    if (newText.trim() === '' && !image) {
      onDelete(id);
    } else if (newText !== text) {
      onUpdate(id, newText);
    }
    setIsEditing(false);
    setSelectionRect(null);
    onEditComplete();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      contentEditableRef.current?.blur();
    } else if (e.key === 'Escape') {
      if (contentEditableRef.current) {
        contentEditableRef.current.innerHTML = markdownToHtml(text);
      }
      contentEditableRef.current?.blur();
    }
  };
  
  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
  };

  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.detail === 1) {
        if (isSelected && !isEditing) {
            enterEditModeAtPoint(e.clientX, e.clientY);
        } else {
            onSelect(id, e);
        }
    } else if (e.detail === 2 && !isEditing) {
        enterEditModeAndSelect('word');
    } else if (e.detail === 3 && !isEditing) {
        enterEditModeAndSelect('all');
    }
  };

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleCollapse(id);
  };

  const handleConnectorMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStartLinkDraw(id);
  }
  
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onShowContextMenu(id, e.clientX, e.clientY);
  };
  
  useEffect(() => {
    if (!isEditing) {
      setSelectionRect(null);
      return;
    }
    const onSelectionChange = () => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        // Ensure selection is inside the current editable node
        if (contentEditableRef.current?.contains(range.commonAncestorContainer)) {
          setSelectionRect(range.getBoundingClientRect());
        } else {
          setSelectionRect(null);
        }
      } else {
        setSelectionRect(null);
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [isEditing]);
  
  const handlePaste = async () => {
      const text = await navigator.clipboard.readText();
      document.execCommand('insertText', false, text);
  };


  const hasToggle = !isRoot && originalChildrenCount > 0;
  const strokeColor = isSelected ? '#3b82f6' : color;
  const animatedStrokeColor = isDropTarget ? '#0ea5e9' : strokeColor;
  const strokeWidth = isSelected || isDropTarget || glowSeverity || isCurrentSearchResult ? 2.5 : 2;
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
    if (isDropTarget) {
        return `0 0 12px 2px ${animatedStrokeColor}99`;
    }
    return '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)';
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
  const finalClassName = `node-group absolute rounded-3xl flex flex-col items-center justify-center ${isRoot ? 'bg-blue-50 dark:bg-slate-800' : 'bg-white dark:bg-slate-700'}`;

  const masteryBgColor = isRoot ? undefined : getMasteryBackgroundColor(masteryScore, theme);

  return (
    <>
      <motion.div
        ref={nodeRef}
        className={`${finalClassName} ${isEditing ? '' : 'mind-map-node-draggable-part'}`}
        data-node-id={id}
        style={{
          width: size.width,
          minHeight: size.height,
          height: isEditing ? 'auto' : size.height,
          pointerEvents: 'auto',
          transformOrigin: 'center center',
          padding: '12px 16px',
          boxSizing: 'border-box',
          cursor: isEditing ? 'text' : cursorStyle,
          touchAction: 'none',
          borderStyle: 'solid',
          backgroundColor: masteryBgColor,
        }}
        animate={{
          x: screenX, y: screenY, scale,
          borderWidth: `${strokeWidth}px`, borderColor: animatedStrokeColor, boxShadow: getBoxShadow(), backgroundColor: masteryBgColor,
        }}
        transition={getTransition()}
        onClick={handleContentClick}
        onContextMenu={handleContextMenu}
      >
        {image && (
          <div
            className={`relative group/image mb-2 ${isEditing ? '' : 'cursor-zoom-in'}`}
            onClick={(e) => { if (!isEditing) { e.stopPropagation(); onViewImage(image.downloadURL); } }}
            title="Click to expand image"
          >
            <img src={image.downloadURL} className="max-h-36 w-auto rounded-lg object-contain pointer-events-none" alt="Node content" />
            {!isEditing && <button
              onClick={(e) => { e.stopPropagation(); onRemoveImage(id); }}
              className="absolute top-1 right-1 w-6 h-6 bg-slate-800/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover/image:opacity-100 hover:bg-slate-900/80 transition-opacity"
              title="Remove image"
            >
              <i className="fa-solid fa-times" style={{fontSize: '12px'}}></i>
            </button>}
          </div>
        )}
        <div
            ref={contentEditableRef}
            contentEditable={isEditing}
            suppressContentEditableWarning
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onClick={(e) => e.stopPropagation()} // Prevent node selection logic from re-triggering
            className={`font-medium text-slate-800 dark:text-slate-100 w-full break-words focus:outline-none min-h-[24px] ${image ? 'text-center' : 'text-left'}`}
            style={{ fontSize: '15px' }}
            dangerouslySetInnerHTML={{ __html: isEditing ? markdownToHtml(text) : markdownToHtml(nodeData.text) }}
        />
        
        {hasToggle && (
            <motion.button 
                className="absolute top-1/2 -translate-y-1/2 -left-3 w-6 h-6 cursor-pointer opacity-60 hover:opacity-100 transition-opacity node-toggle-button rounded-full flex items-center justify-center border-2 border-white dark:border-slate-700" 
                style={{ backgroundColor: color }}
                onClick={handleToggleClick} 
                onMouseDown={(e) => e.stopPropagation()}
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

      {attachmentCount > 0 && !isEditing && (
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
    </motion.div>
    <AnimatePresence>
        {isEditing && selectionRect && (
            <TextEditPopover
                rect={selectionRect}
                transform={transform}
                onCommand={(cmd) => document.execCommand(cmd)}
                onPaste={handlePaste}
            />
        )}
    </AnimatePresence>
  </>
  );
};

export default React.memo(Node);
