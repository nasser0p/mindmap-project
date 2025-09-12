

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MindMapLink } from '../types';

interface EditableLinkProps {
  link: MindMapLink;
  sourcePos: { x: number; y: number };
  targetPos: { x: number; y: number };
  onUpdate: (linkId: string, label: string) => void;
  onDelete: (linkId: string) => void;
  isSelected: boolean;
  onSelect: (linkId: string | null) => void;
}

const EditableLink: React.FC<EditableLinkProps> = ({ link, sourcePos, targetPos, onUpdate, onDelete, isSelected, onSelect }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(link.label);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLabel(link.label);
  }, [link.label]);
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        if(isEditing) handleBlur();
        if(isSelected) onSelect(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [wrapperRef, isEditing, isSelected, onSelect]);

  const handleBlur = () => {
    if (label.trim() && label.trim() !== link.label) {
      onUpdate(link.id, label.trim());
    } else {
      setLabel(link.label);
    }
    setIsEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setLabel(link.label);
      setIsEditing(false);
    }
  };

  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  // Offset the end point so the arrow doesn't overlap the node
  const endX = targetPos.x - (dx / dist) * 35;
  const endY = targetPos.y - (dy / dist) * 35;

  const path = `M${sourcePos.x},${sourcePos.y}L${endX},${endY}`;
  const midX = (sourcePos.x + targetPos.x) / 2;
  const midY = (sourcePos.y + targetPos.y) / 2;
  
  const strokeColor = isSelected ? '#3b82f6' : '#9ca3af';

  return (
    <g
      className="editable-link-group"
      onClick={(e) => {
          e.stopPropagation();
          onSelect(link.id);
      }}
      onDoubleClick={(e) => {
          e.stopPropagation();
          onSelect(link.id);
          setIsEditing(true);
      }}
    >
      <path
        d={path}
        stroke={strokeColor}
        strokeWidth="2.5"
        fill="none"
        markerEnd={isSelected ? "url(#arrowhead-selected)" : "url(#arrowhead)"}
        className="transition-all"
      />
      <path d={path} stroke="transparent" strokeWidth="20" fill="none" />
      <foreignObject x={midX - 75} y={midY - 18} width="150" height="36" style={{ overflow: 'visible', pointerEvents: 'none' }}>
        <div ref={wrapperRef} className="group w-full h-full flex items-center justify-center" style={{ pointerEvents: 'auto' }}>
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="px-2 py-1 bg-white rounded-md text-slate-700 text-sm font-medium outline-none ring-2 ring-blue-500 shadow-lg"
              style={{ textAlign: 'center' }}
            />
          ) : (
            <div
              className={`relative px-2 py-1 rounded-full text-xs font-medium cursor-pointer transition-all duration-150 ${
                isSelected ? 'bg-blue-500 text-white' : 'bg-white text-slate-600 border border-slate-200 group-hover:bg-white group-hover:shadow-md'
              }`}
            >
              {link.label}
              <AnimatePresence>
              {isSelected && (
                <div className="absolute -top-4 -right-4 w-8 h-8 flex items-center justify-center">
                    <motion.button
                      onClick={(e) => {
                          e.stopPropagation();
                          onDelete(link.id);
                      }}
                      className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-600"
                      aria-label="Delete connection"
                      initial={{scale: 0, opacity: 0}}
                      animate={{scale: 1, opacity: 1}}
                      exit={{scale: 0, opacity: 1}}
                      transition={{type: 'spring', duration: 0.3, bounce: 0.5}}
                    >
                      <i className="fa-solid fa-times text-xs" />
                    </motion.button>
                </div>
              )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </foreignObject>
    </g>
  );
};

export default React.memo(EditableLink);