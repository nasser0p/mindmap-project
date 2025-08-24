import React from 'react';
import { motion } from 'framer-motion';

interface ReviewModeBarProps {
  onFinishReview: () => void;
}

const ReviewModeBar: React.FC<ReviewModeBarProps> = ({ onFinishReview }) => {
  return (
    <motion.div
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -60, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute top-4 left-1/2 -translate-x-1/2 z-10 p-2 bg-yellow-100/80 dark:bg-yellow-900/80 backdrop-blur-md rounded-full shadow-lg flex items-center gap-4 border border-yellow-300/80 dark:border-yellow-800/80"
    >
      <div className="flex items-center gap-2 pl-2">
        <i className="fa-solid fa-highlighter text-yellow-600 dark:text-yellow-400"></i>
        <span className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">Review Mode</span>
      </div>
      <button
        onClick={onFinishReview}
        className="px-4 py-1.5 text-sm font-semibold rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors"
        title="Exit review mode and clear highlights"
      >
        Finish Review
      </button>
    </motion.div>
  );
};

export default ReviewModeBar;
