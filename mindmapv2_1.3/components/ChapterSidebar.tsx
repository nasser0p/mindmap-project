import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Chapter } from '../types';

interface ChapterBarProps {
  chapters: Chapter[];
  activeChapterId: string | null;
  onSwitchChapter: (chapterId: string) => void;
  onAddChapter: (name: string) => void;
  onDeleteChapter: (chapterId: string) => void;
  onRenameChapter: (chapterId: string, newName: string) => void;
}

const ChapterTab: React.FC<{
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
  
  // Sync name with prop if not editing
  useEffect(() => {
    if (!isEditing) setName(chapter.name);
  }, [chapter.name, isEditing]);

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
      className={`relative group flex-shrink-0 flex items-center justify-between px-4 py-2.5 rounded-md cursor-pointer transition-colors gap-3 text-sm ${
        isActive
          ? 'bg-white/70 dark:bg-slate-800/70'
          : 'text-slate-500 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-slate-800/40'
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="active-chapter-indicator"
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ backgroundColor: chapter.root.color }}
        />
      )}
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
            className="bg-transparent outline-none w-full font-semibold"
          />
        ) : (
          <span className="font-semibold truncate">{chapter.name}</span>
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
          className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-500 flex-shrink-0 transition-opacity"
        >
          <i className="fa-solid fa-times text-xs"></i>
        </button>
      )}
    </div>
  );
};

const ChapterBar: React.FC<ChapterBarProps> = (props) => {
    const { chapters, activeChapterId, onSwitchChapter, onAddChapter, onDeleteChapter, onRenameChapter } = props;
    const [newChapterName, setNewChapterName] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const addInputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
  
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
    
    // Scroll to active tab
    useEffect(() => {
        if (activeChapterId && scrollContainerRef.current) {
            const tabElement = scrollContainerRef.current.querySelector(`[data-chapter-id="${activeChapterId}"]`);
            tabElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, [activeChapterId]);

    return (
        <div className="flex-shrink-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-lg border-b border-white/30 dark:border-slate-700/50">
            <div
                ref={scrollContainerRef}
                className="flex items-center gap-2 overflow-x-auto no-scrollbar px-4"
            >
                {chapters.map(chapter => (
                    <div key={chapter.id} data-chapter-id={chapter.id}>
                        <ChapterTab
                            chapter={chapter}
                            isActive={chapter.id === activeChapterId}
                            onSelect={() => onSwitchChapter(chapter.id)}
                            onDelete={() => onDeleteChapter(chapter.id)}
                            onRename={(newName) => onRenameChapter(chapter.id, newName)}
                        />
                    </div>
                ))}

                {isAdding ? (
                     <motion.div initial={{ width: 0 }} animate={{ width: 180 }} transition={{type: 'spring', stiffness: 400, damping: 30}} className="p-2">
                        <input
                            ref={addInputRef}
                            type="text"
                            value={newChapterName}
                            onChange={(e) => setNewChapterName(e.target.value)}
                            onBlur={handleAddChapter}
                            onKeyDown={e => e.key === 'Enter' && handleAddChapter()}
                            placeholder="New chapter..."
                            className="w-full text-sm p-2 rounded-md bg-white/80 dark:bg-slate-900/80 border border-blue-400 outline-none ring-2 ring-blue-200"
                        />
                     </motion.div>
                ) : (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="w-10 h-10 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 rounded-full transition-colors flex-shrink-0"
                        title="Add new chapter"
                    >
                        <i className="fa-solid fa-plus"></i>
                    </button>
                )}
            </div>
        </div>
    );
};

export default ChapterBar;