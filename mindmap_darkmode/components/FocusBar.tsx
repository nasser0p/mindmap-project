import React from 'react';
import { MindMapNode as MindMapNodeData } from '../types';
import { motion } from 'framer-motion';

interface FocusBarProps {
  path: MindMapNodeData[];
  onNavigate: (nodeId: string | null) => void;
}

const FocusBar: React.FC<FocusBarProps> = ({ path, onNavigate }) => {
  return (
    <motion.div
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -60, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="focus-bar absolute top-4 left-1/2 -translate-x-1/2 z-10 p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-full shadow-lg flex items-center gap-2 max-w-[90vw] overflow-x-auto"
    >
      {path.map((node, index) => (
        <React.Fragment key={node.id}>
          {index > 0 && <i className="fa-solid fa-chevron-right text-slate-400 dark:text-slate-500 text-xs flex-shrink-0"></i>}
          <button
            onClick={() => onNavigate(index === 0 ? null : node.id)}
            className="px-3 py-1 text-sm font-medium rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-700 dark:text-slate-200 whitespace-nowrap"
            title={index === 0 ? "Return to full map" : `Focus on ${node.text}`}
          >
            {node.text}
          </button>
        </React.Fragment>
      ))}
      <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1 flex-shrink-0"></div>
      <button
        onClick={() => onNavigate(null)}
        className="px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900/80 transition-colors flex-shrink-0"
        title="Exit focus mode (Esc)"
      >
        <i className="fa-solid fa-times mr-1.5"></i>
        Exit Focus
      </button>
    </motion.div>
  );
};

export default FocusBar;