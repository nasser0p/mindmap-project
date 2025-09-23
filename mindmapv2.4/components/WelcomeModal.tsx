import React from 'react';
import { motion } from 'framer-motion';

interface WelcomeModalProps {
  onStart: () => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ onStart }) => {
  return (
    <motion.div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="relative w-full max-w-lg p-8 glass-effect rounded-2xl text-center"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 25 }}
      >
        <i className="fa-solid fa-sitemap text-5xl text-blue-500 mb-4"></i>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Welcome to MindMaster AI!</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 mb-6">Let's generate your first AI mind map. This quick tutorial will guide you through:</p>
        
        <ul className="text-left list-disc list-inside space-y-2 mb-8 text-slate-600 dark:text-slate-300 mx-auto max-w-xs">
            <li>Creating your first subject</li>
            <li>Uploading a document (PDF/text)</li>
            <li>Generating a map with one click</li>
        </ul>

        <button
          onClick={onStart}
          className="w-full py-3 px-4 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Start the 30-Second Tour
        </button>
      </motion.div>
    </motion.div>
  );
};

export default WelcomeModal;