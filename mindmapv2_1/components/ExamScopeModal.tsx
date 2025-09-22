import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ExamScopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectScope: (scope: 'chapter' | 'subject') => void;
}

const ExamScopeModal: React.FC<ExamScopeModalProps> = ({ isOpen, onClose, onSelectScope }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8"
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <i className="fa-solid fa-times"></i>
            </button>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 text-center mb-2">Choose Exam Scope</h2>
            <p className="text-slate-500 dark:text-slate-400 text-center mb-6">How would you like to be tested?</p>
            <div className="flex flex-col gap-4">
              <button
                onClick={() => onSelectScope('chapter')}
                className="w-full p-6 bg-slate-100 dark:bg-slate-700 rounded-lg text-left hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-xl text-blue-500">
                    <i className="fa-solid fa-file-lines"></i>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">Test Current Chapter</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">A focused quiz on the current topic.</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => onSelectScope('subject')}
                className="w-full p-6 bg-slate-100 dark:bg-slate-700 rounded-lg text-left hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                 <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-xl text-purple-500">
                    <i className="fa-solid fa-book"></i>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">Test Entire Subject</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">A comprehensive exam on all chapters.</p>
                  </div>
                </div>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ExamScopeModal;
