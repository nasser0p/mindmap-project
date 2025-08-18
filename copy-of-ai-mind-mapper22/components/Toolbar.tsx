import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type ToolMode = 'pan' | 'select';

interface ToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  zoomLevel: number;
  isSaving: boolean;
  toolMode: ToolMode;
  onToolChange: (mode: ToolMode) => void;
}

const ToolbarButton: React.FC<{ icon: string; onClick: () => void; disabled?: boolean; title: string; isActive?: boolean; }> = ({ icon, onClick, disabled, title, isActive = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        isActive 
            ? 'bg-blue-500 text-white' 
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
    }`}
  >
    <i className={`fa-solid ${icon}`}></i>
  </button>
);

const Toolbar: React.FC<ToolbarProps> = (props) => {
  const { toolMode, onToolChange, ...rest } = props;
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="absolute top-6 left-6 z-20 flex items-start gap-2">
      <motion.div
        layout
        className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-xl shadow-lg p-1 flex items-center gap-1 border border-slate-200/80 dark:border-slate-700/80"
        initial={{ width: 'auto' }}
        animate={{ width: isExpanded ? 'auto' : 52 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <AnimatePresence>
        {isExpanded && (
            <motion.div 
                className="flex items-center gap-1"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1, transition: { delay: 0.1 } }}
                exit={{ opacity: 0, scale: 0.8 }}
            >
              <ToolbarButton icon="fa-hand" onClick={() => onToolChange('pan')} title="Pan Tool (V)" isActive={toolMode === 'pan'} />
              <ToolbarButton icon="fa-vector-square" onClick={() => onToolChange('select')} title="Selection Tool (Hold Ctrl)" isActive={toolMode === 'select'} />
              
              <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1"></div>
              
              <ToolbarButton icon="fa-undo" onClick={rest.onUndo} disabled={!rest.canUndo} title="Undo (Ctrl+Z)" />
              <ToolbarButton icon="fa-redo" onClick={rest.onRedo} disabled={!rest.canRedo} title="Redo (Ctrl+Y)" />
              
              <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1"></div>
              
              <ToolbarButton icon="fa-search-minus" onClick={rest.onZoomOut} title="Zoom Out" />
              <button onClick={rest.onZoomToFit} className="px-3 h-10 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg" title="Fit to Screen">
                {Math.round(rest.zoomLevel * 100)}%
              </button>
              <ToolbarButton icon="fa-search-plus" onClick={rest.onZoomIn} title="Zoom In" />
              
              <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1"></div>
              
              <div className="flex items-center gap-2 px-3 text-sm text-slate-500 dark:text-slate-400" title="Save Status">
                {rest.isSaving ? (
                    <>
                        <i className="fa-solid fa-spinner fa-spin"></i>
                        <span>Saving...</span>
                    </>
                ) : (
                    <>
                        <i className="fa-solid fa-check-circle text-green-500 dark:text-green-400"></i>
                        <span>Saved</span>
                    </>
                )}
              </div>
            </motion.div>
        )}
        </AnimatePresence>
         <ToolbarButton icon={isExpanded ? 'fa-chevron-left' : 'fa-toolbox'} onClick={() => setIsExpanded(!isExpanded)} title={isExpanded ? 'Collapse Toolbar' : 'Expand Toolbar'} />
      </motion.div>
    </div>
  );
};

export default Toolbar;