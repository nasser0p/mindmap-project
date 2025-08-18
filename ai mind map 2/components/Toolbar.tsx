import React, { useState } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { PALETTE_COLORS } from '../constants';

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
  selectedNodeCount: number;
  onDeleteSelected: () => void;
  onSetSelectedColor: (color: string) => void;
}

const ToolbarButton: React.FC<{ icon: string; onClick: () => void; disabled?: boolean; title: string; isActive?: boolean; 'data-tutorial-id'?: string; }> = ({ icon, onClick, disabled, title, isActive = false, 'data-tutorial-id': dataTutorialId }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    data-tutorial-id={dataTutorialId}
    className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        isActive 
            ? 'bg-blue-500 text-white' 
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
    }`}
  >
    <i className={`fa-solid ${icon}`}></i>
  </button>
);

const dropdownVariants: Variants = {
    hidden: { opacity: 0, y: 10, scale: 0.95, transition: { duration: 0.15 } },
    visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', damping: 15, stiffness: 200 } },
};

const Toolbar: React.FC<ToolbarProps> = (props) => {
    const { 
        toolMode, 
        onToolChange,
        selectedNodeCount,
        onDeleteSelected,
        onSetSelectedColor,
        ...rest 
    } = props;
    const [isExpanded, setIsExpanded] = useState(true);
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

    const handleColorClick = (color: string) => {
        onSetSelectedColor(color);
        setIsColorPickerOpen(false); // Close after selection
    }

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
                            <ToolbarButton icon="fa-vector-square" data-tutorial-id="selection-tool" onClick={() => onToolChange('select')} title="Selection Tool (Hold Ctrl)" isActive={toolMode === 'select'} />
                            
                            <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1"></div>
                            
                            <ToolbarButton icon="fa-undo" onClick={rest.onUndo} disabled={!rest.canUndo} title="Undo (Ctrl+Z)" />
                            <ToolbarButton icon="fa-redo" onClick={rest.onRedo} disabled={!rest.canRedo} title="Redo (Ctrl+Y)" />

                            {/* --- New Multi-Selection Panel --- */}
                            <AnimatePresence>
                                {selectedNodeCount > 1 && (
                                    <motion.div
                                        layout="position"
                                        initial={{ opacity: 0, width: 0 }}
                                        animate={{ opacity: 1, width: 'auto', transition: { delay: 0.1 } }}
                                        exit={{ opacity: 0, width: 0, transition: { duration: 0.1 } }}
                                        className="flex items-center gap-1 overflow-hidden"
                                    >
                                        <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1"></div>
                                        <div className="px-2 text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                            {selectedNodeCount} Selected
                                        </div>
                                        <div className="relative" onMouseEnter={() => setIsColorPickerOpen(true)} onMouseLeave={() => setIsColorPickerOpen(false)}>
                                            <ToolbarButton icon="fa-palette" onClick={() => {}} title="Change color" />
                                            <AnimatePresence>
                                                {isColorPickerOpen && (
                                                    <motion.div
                                                        initial="hidden"
                                                        animate="visible"
                                                        exit="hidden"
                                                        variants={dropdownVariants}
                                                        className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-2 z-10"
                                                    >
                                                        <div className="grid grid-cols-5 gap-2 p-1">
                                                            {PALETTE_COLORS.map(color => (
                                                                <motion.button
                                                                    key={color}
                                                                    onClick={() => handleColorClick(color)}
                                                                    className="w-7 h-7 rounded-full"
                                                                    style={{ backgroundColor: color }}
                                                                    aria-label={`Set color to ${color}`}
                                                                    title={`Set color to ${color}`}
                                                                    whileHover={{ scale: 1.2, transition: { duration: 0.1 } }}
                                                                    whileTap={{ scale: 0.9 }}
                                                                />
                                                            ))}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                        <ToolbarButton icon="fa-trash-can" onClick={onDeleteSelected} title="Delete selected nodes" />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            
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
