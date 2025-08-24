import React from 'react';
import { motion } from 'framer-motion';

interface GuidedReviewNudgeProps {
  onStart: () => void;
  onDismiss: () => void;
}

const GuidedReviewNudge: React.FC<GuidedReviewNudgeProps> = ({ onStart, onDismiss }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      className="fixed bottom-24 right-6 z-20 p-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-xl shadow-lg border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-4"
    >
      <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-500 text-2xl">
        <i className="fa-solid fa-route"></i>
      </div>
      <div>
        <h4 className="font-bold text-slate-800 dark:text-slate-100">Review your weak spots?</h4>
        <p className="text-sm text-slate-600 dark:text-slate-300">Let's take a guided tour of the topics you missed.</p>
      </div>
      <button
        onClick={onStart}
        className="ml-2 px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors whitespace-nowrap"
      >
        Start Review
      </button>
      <button
        onClick={onDismiss}
        className="w-7 h-7 absolute -top-2 -right-2 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
        title="Dismiss"
      >
        <i className="fa-solid fa-times text-sm"></i>
      </button>
    </motion.div>
  );
};

export default GuidedReviewNudge;
