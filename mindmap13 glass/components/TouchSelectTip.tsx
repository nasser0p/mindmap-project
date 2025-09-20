import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

interface TouchSelectTipProps {
  onDismiss: () => void;
}

const TouchSelectTip: React.FC<TouchSelectTipProps> = ({ onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, 5000); // Tip disappears after 5 seconds

    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 p-3 bg-slate-800 text-white rounded-lg shadow-lg text-sm font-semibold flex items-center gap-3"
    >
      <i className="fa-solid fa-lightbulb text-yellow-400"></i>
      <span>Tip: In Select Mode, press and hold on the background to draw a selection box.</span>
    </motion.div>
  );
};

export default TouchSelectTip;
