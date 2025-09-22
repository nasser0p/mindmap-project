import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { SearchResult } from '../types';

interface FindInMapProps {
  query: string;
  onQueryChange: (query: string) => void;
  scope: 'chapter' | 'subject';
  onScopeChange: (scope: 'chapter' | 'subject') => void;
  results: SearchResult[];
  currentIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

const FindInMap: React.FC<FindInMapProps> = ({
  query,
  onQueryChange,
  scope,
  onScopeChange,
  results,
  currentIndex,
  onNext,
  onPrevious,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onPrevious();
      } else {
        onNext();
      }
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const resultCount = results.length;
  const currentResult = resultCount > 0 ? results[currentIndex] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="w-[550px] flex flex-col items-stretch gap-2 p-2 glass-effect rounded-xl"
    >
        <div className="flex items-center gap-2">
            <i className="fa-solid fa-magnifying-glass text-slate-400 dark:text-slate-500 pl-2"></i>
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Find in map..."
                className="flex-1 bg-transparent focus:outline-none text-slate-800 dark:text-slate-100"
            />
            <span className={`text-sm font-medium pr-2 ${query && resultCount === 0 ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
                {query ? (resultCount > 0 ? `${currentIndex + 1} of ${resultCount}` : '0 results') : ''}
            </span>
            <button
                onClick={onPrevious}
                disabled={resultCount === 0}
                title="Previous (Shift+Enter)"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 disabled:opacity-50"
            >
                <i className="fa-solid fa-chevron-up"></i>
            </button>
            <button
                onClick={onNext}
                disabled={resultCount === 0}
                title="Next (Enter)"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 disabled:opacity-50"
            >
                <i className="fa-solid fa-chevron-down"></i>
            </button>
            <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1"></div>
            <button
                onClick={onClose}
                title="Close (Esc)"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
            >
                <i className="fa-solid fa-times"></i>
            </button>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-white/20 dark:border-slate-700/50 pt-2 text-sm">
            <div className="flex items-center gap-2 pl-2">
                 <label htmlFor="search-scope" className="font-medium text-slate-500 dark:text-slate-400">Search:</label>
                 <select
                    id="search-scope"
                    value={scope}
                    onChange={(e) => onScopeChange(e.target.value as 'chapter' | 'subject')}
                    className="bg-transparent font-semibold text-slate-700 dark:text-slate-200 focus:outline-none rounded"
                >
                    <option value="chapter">In This Chapter</option>
                    <option value="subject">In Entire Subject</option>
                </select>
            </div>
            {currentResult && scope === 'subject' && (
                <div className="text-right text-slate-500 dark:text-slate-400 pr-2">
                    Found in: <span className="font-semibold text-slate-600 dark:text-slate-300 truncate">{currentResult.chapterName}</span>
                </div>
            )}
        </div>
    </motion.div>
  );
};

export default FindInMap;