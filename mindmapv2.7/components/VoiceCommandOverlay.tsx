import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VoiceStatus } from './Toolbar';

interface VoiceCommandOverlayProps {
  status: VoiceStatus;
  transcript: string;
}

const VoiceCommandOverlay: React.FC<VoiceCommandOverlayProps> = ({ status, transcript }) => {
  const getStatusText = () => {
    switch (status) {
      case 'listening':
        return 'Listening...';
      case 'processing':
        return 'Processing...';
       case 'speaking':
        return 'Responding...';
      default:
        return '';
    }
  };

  return (
    <AnimatePresence>
      {(status === 'listening' || status === 'processing' || status === 'speaking') && (
        <motion.div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xl z-30 px-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <div className="glass-effect rounded-xl p-4 text-center">
            <p className="font-semibold text-slate-800 dark:text-slate-100 mb-1">{getStatusText()}</p>
            <p className="text-slate-600 dark:text-slate-300 min-h-[1.5em]">
              {transcript || <span className="text-slate-400 italic">Say something like "Find the root node"</span>}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default VoiceCommandOverlay;
