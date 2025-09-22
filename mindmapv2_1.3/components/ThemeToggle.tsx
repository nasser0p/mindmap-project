import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ThemeToggleProps {
  theme: 'light' | 'dark';
  onToggle: () => void;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      className="fixed bottom-6 left-6 w-16 h-16 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full flex items-center justify-center shadow-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition-all duration-300 transform hover:scale-110 z-20"
      title="Toggle Theme"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <div className="relative w-8 h-8 flex items-center justify-center overflow-hidden">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={theme === 'light' ? 'sun' : 'moon'}
            initial={{ y: -30, opacity: 0, rotate: -90 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: 30, opacity: 0, rotate: 90 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="absolute"
          >
            <i className={`fa-solid ${theme === 'light' ? 'fa-sun' : 'fa-moon'} text-2xl`}></i>
          </motion.div>
        </AnimatePresence>
      </div>
    </button>
  );
};

export default ThemeToggle;
