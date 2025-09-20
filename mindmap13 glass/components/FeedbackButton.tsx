import React from 'react';
import { motion } from 'framer-motion';

interface FeedbackButtonProps {
  onClick: () => void;
}

const FeedbackButton: React.FC<FeedbackButtonProps> = ({ onClick }) => {
  return (
    <motion.button
      onClick={onClick}
      className="fixed bottom-6 right-6 w-16 h-16 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full flex items-center justify-center shadow-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition-all duration-300 transform hover:scale-110 z-20"
      title="Send Feedback"
      aria-label="Send Feedback"
    >
      <div className="relative w-8 h-8 flex items-center justify-center overflow-hidden">
        <i className="fa-solid fa-comment-dots text-2xl"></i>
      </div>
    </motion.button>
  );
};

export default FeedbackButton;
