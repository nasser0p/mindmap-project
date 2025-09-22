import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MindMapDocument } from '../types';
import { useAuth } from '../contexts/AuthContext';
import type { User } from '../firebase';


interface SubjectTabsProps {
  documents: MindMapDocument[];
  activeDocumentId: string | null;
  user: User;
  editingSubjectId: string | null;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onStartEdit: (id: string) => void;
  onEndEdit: () => void;
  onRestartTutorial: () => void;
}

const SubjectTab: React.FC<{
  doc: MindMapDocument;
  isActive: boolean;
  isEditing: boolean;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onStartEdit: (id: string) => void;
  onEndEdit: () => void;
}> = ({ doc, isActive, isEditing, onSwitch, onDelete, onRename, onStartEdit, onEndEdit }) => {
  const [name, setName] = useState(doc.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);
  
  useEffect(() => {
    // If not editing, ensure the name is synced with the prop from the database.
    if (!isEditing) {
      setName(doc.name);
    }
  }, [doc.name, isEditing]);

  const handleRename = () => {
    if (name.trim() && name.trim() !== doc.name) {
      onRename(doc.id, name.trim());
    } else {
      setName(doc.name); // Revert if empty or unchanged
    }
    onEndEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRename();
    else if (e.key === 'Escape') {
      setName(doc.name);
      onEndEdit();
    }
  };
  
  const handleDoubleClick = () => {
    if (!isActive) onSwitch(doc.id);
    onStartEdit(doc.id);
  };

  const activeClasses = 'bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100';
  const inactiveClasses = 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50';
  const baseClasses = 'relative group flex-shrink-0 flex items-center h-10 px-4 rounded-t-lg transition-all duration-200';
  const combinedClasses = `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`;

  return (
    <div
      onClick={() => onSwitch(doc.id)}
      onDoubleClick={handleDoubleClick}
      className={combinedClasses}
    >
      {isActive && (
        <motion.div
            layoutId="active-subject-border"
            className="absolute top-0 left-0 right-0 h-[3px] rounded-t-sm"
            style={{ backgroundColor: doc.color || '#a855f7' }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        />
      )}
      {!isActive && doc.color && (
        <span
            className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
            style={{ backgroundColor: doc.color }}
            aria-hidden="true"
        ></span>
      )}
      <div className="flex-1 min-w-0 w-32">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="bg-transparent outline-none w-full font-semibold text-sm"
          />
        ) : (
          <span className="font-semibold select-none truncate text-sm">
            {doc.name}
          </span>
        )}
      </div>
      {!isEditing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Are you sure you want to delete "${doc.name}"? This cannot be undone.`)) {
                onDelete(doc.id);
            }
          }}
          className={`ml-2 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${
            isActive 
                ? 'text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-500' 
                : 'text-slate-400 hover:bg-slate-300/50 dark:hover:bg-slate-700/50'
            }`}
          title={`Delete ${doc.name}`}
        >
          <i className="fa-solid fa-times text-xs"></i>
        </button>
      )}
    </div>
  );
};


const SubjectTabs: React.FC<SubjectTabsProps> = (props) => {
  const { 
    documents, activeDocumentId, user, editingSubjectId,
    onSwitch, onAdd, onDelete, onRename, onStartEdit, onEndEdit, onRestartTutorial 
  } = props;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { logout } = useAuth();

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) {
      const scrollBuffer = 5; 
      const isScrollable = el.scrollWidth > el.clientWidth;
      setShowLeftFade(el.scrollLeft > scrollBuffer);
      setShowRightFade(isScrollable && el.scrollLeft < el.scrollWidth - el.clientWidth - scrollBuffer);
    }
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      checkScroll();
      el.addEventListener('scroll', checkScroll, { passive: true });
      const resizeObserver = new ResizeObserver(checkScroll);
      resizeObserver.observe(el);

      return () => {
        el.removeEventListener('scroll', checkScroll);
        resizeObserver.unobserve(el);
      };
    }
  }, [checkScroll, documents]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
            setIsMenuOpen(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // Scroll to the active or newly editing tab
  useEffect(() => {
    const targetId = editingSubjectId || activeDocumentId;
    if (targetId && scrollContainerRef.current) {
      const tabElement = scrollContainerRef.current.querySelector(`[data-doc-id="${targetId}"]`);
      tabElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeDocumentId, editingSubjectId]);

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 pt-2 flex items-center justify-between gap-4 flex-shrink-0">
      <div className="flex-1 min-w-0 relative">
        <div
          ref={scrollContainerRef}
          className="flex items-center gap-1 overflow-x-auto no-scrollbar"
        >
          <AnimatePresence>
          {documents.map(doc => (
            <motion.div
                key={doc.id}
                data-doc-id={doc.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
            <SubjectTab
                doc={doc}
                isActive={doc.id === activeDocumentId}
                isEditing={doc.id === editingSubjectId}
                onSwitch={onSwitch}
                onDelete={onDelete}
                onRename={onRename}
                onStartEdit={onStartEdit}
                onEndEdit={onEndEdit}
            />
            </motion.div>
          ))}
          </AnimatePresence>
          <button 
            onClick={onAdd}
            data-tutorial-id="add-subject"
            className="w-8 h-8 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors flex-shrink-0"
            title="Add new subject"
          >
            <i className="fa-solid fa-plus"></i>
          </button>
        </div>
        {/* Left Fade */}
        <div className={`absolute top-0 left-0 bottom-0 w-8 bg-gradient-to-r from-white dark:from-slate-800 to-transparent pointer-events-none transition-opacity duration-300 ${showLeftFade ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
        {/* Right Fade */}
        <div className={`absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-slate-800 to-transparent pointer-events-none transition-opacity duration-300 ${showRightFade ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
      </div>

      <div className="relative" ref={menuRef}>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <img src={user.photoURL || undefined} alt="User" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
        </button>
        <AnimatePresence>
            {isMenuOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-2 z-50"
                >
                    <div className="flex items-center gap-3 p-2 border-b border-slate-200 dark:border-slate-700 mb-2">
                        <img src={user.photoURL || undefined} alt="User" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                        <div className="min-w-0">
                            <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{user.displayName}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            onRestartTutorial();
                            setIsMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                    >
                        <i className="fa-solid fa-graduation-cap w-4 text-center"></i>
                        <span>Run Tutorial</span>
                    </button>
                    <button
                        onClick={logout}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                    >
                        <i className="fa-solid fa-arrow-right-from-bracket w-4 text-center"></i>
                        <span>Sign Out</span>
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
      </div>
    </header>
  );
};

export default SubjectTabs;