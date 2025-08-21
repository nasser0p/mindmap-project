import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Chapter } from '../types';

interface ChapterSidebarProps {
  chapters: Chapter[];
  activeChapterId: string | null;
  onSwitchChapter: (chapterId: string) => void;
  onAddChapter: (name: string) => void;
  onDeleteChapter: (chapterId: string) => void;
  onRenameChapter: (chapterId: string, newName: string) => void;
}

const ChapterItem: React.FC<{
  chapter: Chapter;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
}> = ({ chapter, isActive, onSelect, onDelete, onRename }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(chapter.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleRename = () => {
    if (name.trim() && name.trim() !== chapter.name) {
      onRename(name.trim());
    } else {
      setName(chapter.name);
    }
    setIsEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRename();
    else if (e.key === 'Escape') {
      setName(chapter.name);
      setIsEditing(false);
    }
  };

  return (
    <div
      onClick={onSelect}
      onDoubleClick={() => setIsEditing(true)}
      className={`group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors gap-3 ${
        isActive
          ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span 
            className="w-2 h-2 rounded-full flex-shrink-0" 
            style={{ backgroundColor: chapter.root.color }}
            aria-hidden="true"
        />
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            className="bg-transparent outline-none w-full font-semibold text-sm"
          />
        ) : (
          <span className="font-semibold text-sm truncate">{chapter.name}</span>
        )}
      </div>
      {!isEditing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if(window.confirm(`Delete chapter "${chapter.name}"? This cannot be undone.`)) {
                onDelete();
            }
          }}
          className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-500 flex-shrink-0"
        >
          <i className="fa-solid fa-trash-can text-xs"></i>
        </button>
      )}
    </div>
  );
};

const ChapterSidebar: React.FC<ChapterSidebarProps> = ({ chapters, activeChapterId, onSwitchChapter, onAddChapter, onDeleteChapter, onRenameChapter }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [newChapterName, setNewChapterName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding) {
      addInputRef.current?.focus();
    }
  }, [isAdding]);

  const handleAddChapter = () => {
    if(newChapterName.trim()) {
        onAddChapter(newChapterName.trim());
    }
    setIsAdding(false);
    setNewChapterName('');
  };

  return (
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
      className={`bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm h-full flex flex-col border-r border-slate-200 dark:border-slate-700 ${
        isCollapsed ? 'w-14' : 'w-64'
      }`}
    >
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0, transition: { delay: 0.1 } }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 p-3 flex flex-col min-w-0"
          >
            <div className="flex-1 overflow-y-auto space-y-1">
                {chapters.map(chapter => (
                    <ChapterItem
                        key={chapter.id}
                        chapter={chapter}
                        isActive={chapter.id === activeChapterId}
                        onSelect={() => onSwitchChapter(chapter.id)}
                        onDelete={() => onDeleteChapter(chapter.id)}
                        onRename={(newName) => onRenameChapter(chapter.id, newName)}
                    />
                ))}
                {isAdding && (
                    <div className="px-2">
                        <input
                            ref={addInputRef}
                            type="text"
                            value={newChapterName}
                            onChange={(e) => setNewChapterName(e.target.value)}
                            onBlur={handleAddChapter}
                            onKeyDown={e => e.key === 'Enter' && handleAddChapter()}
                            placeholder="New chapter name..."
                            className="w-full text-sm p-2 rounded-md bg-white dark:bg-slate-900 border border-blue-400 outline-none ring-2 ring-blue-200"
                        />
                    </div>
                )}
            </div>
            
            <button
                onClick={() => setIsAdding(true)}
                className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
            >
                <i className="fa-solid fa-plus"></i>
                Add Chapter
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-shrink-0 p-2 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-10 h-10 flex items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
        >
          <motion.i
            animate={{ rotate: isCollapsed ? 180 : 0 }}
            className="fa-solid fa-chevron-left"
          />
        </button>
      </div>
    </motion.div>
  );
};

export default ChapterSidebar;