import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface FindInMapProps {
  query: string;
  onQueryChange: (query: string) => void;
  resultCount: number;
  currentIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

const FindInMap: React.FC<FindInMapProps> = ({
  query,
  onQueryChange,
  resultCount,
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

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="absolute top-6 right-6 z-20 flex items-center gap-2 p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-xl shadow-lg border border-slate-200/80 dark:border-slate-700/80"
    >
      <i className="fa-solid fa-magnifying-glass text-slate-400 dark:text-slate-500 pl-2"></i>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in map..."
        className="w-48 bg-transparent focus:outline-none text-slate-800 dark:text-slate-100"
      />
      <span className={`text-sm font-medium pr-2 ${query && resultCount === 0 ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
        {query ? (resultCount > 0 ? `${currentIndex + 1} of ${resultCount}` : '0 results') : ''}
      </span>
      <button
        onClick={onPrevious}
        disabled={resultCount === 0}
        title="Previous (Shift+Enter)"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
      >
        <i className="fa-solid fa-chevron-up"></i>
      </button>
      <button
        onClick={onNext}
        disabled={resultCount === 0}
        title="Next (Enter)"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
      >
        <i className="fa-solid fa-chevron-down"></i>
      </button>
      <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1"></div>
      <button
        onClick={onClose}
        title="Close (Esc)"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
      >
        <i className="fa-solid fa-times"></i>
      </button>
    </motion.div>
  );
};

export default FindInMap;
