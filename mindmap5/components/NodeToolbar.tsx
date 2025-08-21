import React, { useState } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { PALETTE_COLORS } from '../constants';

const ToolbarButton = ({ icon, active = false, loading = false, onClick, title, disabled = false, 'data-tutorial-id': dataTutorialId }: { icon: string; active?: boolean; loading?: boolean; onClick?: React.MouseEventHandler<HTMLButtonElement>; title: string; disabled?: boolean; 'data-tutorial-id'?: string; }) => {
    const baseClasses = 'w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50';
    const activeClasses = active ? 'bg-blue-500 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600';
    return (
        <button
            onClick={onClick}
            disabled={loading || disabled}
            className={`${baseClasses} ${activeClasses}`}
            aria-label={title}
            title={title}
            data-tutorial-id={dataTutorialId}
        >
            {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className={`fa-solid ${icon}`}></i>}
        </button>
    )
}

const DropdownMenuItem = ({ icon, text, onClick, loading = false, disabled = false }: { icon: string; text: string; onClick: () => void; loading?: boolean; disabled?: boolean; }) => (
    <button
        onClick={onClick}
        disabled={loading || disabled}
        className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
        {loading ? <i className="fa-solid fa-spinner fa-spin w-4 text-center"></i> : <i className={`fa-solid ${icon} w-4 text-center`}></i>}
        <span>{text}</span>
    </button>
);


interface NodeToolbarProps {
    onAdd: () => void;
    onInsertParent: () => void;
    onDelete: () => void;
    onGenerateIdeas: () => void;
    onRephraseNode: () => void;
    onExtractConcepts: () => void;
    onGenerateAnalogy: () => void;
    onSetColor: (color: string) => void;
    onFocusNode: () => void;
    onTestBranch: () => void;
    onSelectBranch: () => void;
    onSelectChildren: () => void;
    onSelectSiblings: () => void;
    isGeneratingIdeas: boolean;
    isRephrasing: boolean;
    isExtractingConcepts: boolean;
    isGeneratingAnalogy: boolean;
    hasChildren: boolean;
    isRoot: boolean;
}

const dropdownVariants: Variants = {
    hidden: { opacity: 0, y: 10, scale: 0.95, transition: { duration: 0.15 } },
    visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', damping: 15, stiffness: 200 } },
};

const NodeToolbar: React.FC<NodeToolbarProps> = (props) => {
    const {
        onAdd, onInsertParent, onDelete, onGenerateIdeas, onRephraseNode, onExtractConcepts, onGenerateAnalogy, onSetColor, onFocusNode, onTestBranch,
        onSelectBranch, onSelectChildren, onSelectSiblings,
        isGeneratingIdeas, isRephrasing, isExtractingConcepts, isGeneratingAnalogy, hasChildren, isRoot
    } = props;
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div className="flex justify-center items-center">
        <div className="bg-white dark:bg-slate-800 rounded-full p-1 flex items-center gap-1 shadow-md border border-slate-200 dark:border-slate-700">
            <ToolbarButton icon="fa-plus" onClick={onAdd} title="Add child node" data-tutorial-id="add-child-node" />
            <ToolbarButton icon="fa-diagram-predecessor" onClick={onInsertParent} title="Insert parent node" disabled={isRoot} />
            <ToolbarButton icon="fa-crosshairs" onClick={onFocusNode} title="Focus on this branch" disabled={isRoot} />
            <ToolbarButton icon="fa-vial-circle-check" onClick={onTestBranch} title="Test this Branch" disabled={isRoot} />

            {/* Advanced Selection Menu */}
            <div className="relative" onMouseEnter={() => setOpenMenu('select')} onMouseLeave={() => setOpenMenu(null)}>
                <ToolbarButton icon="fa-object-group" title="Advanced Selection" active={openMenu === 'select'} />
                <AnimatePresence>
                {openMenu === 'select' && (
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        variants={dropdownVariants}
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-2 z-10"
                    >
                       <DropdownMenuItem text="Select Branch" icon="fa-object-group" onClick={onSelectBranch} />
                       <DropdownMenuItem text="Select Children" icon="fa-children" onClick={onSelectChildren} disabled={!hasChildren} />
                       <DropdownMenuItem text="Select Siblings" icon="fa-users-line" onClick={onSelectSiblings} disabled={isRoot} />
                    </motion.div>
                )}
                </AnimatePresence>
            </div>

            {/* AI Assist Menu */}
            <div className="relative" onMouseEnter={() => setOpenMenu('ai')} onMouseLeave={() => setOpenMenu(null)}>
                <ToolbarButton icon="fa-wand-magic-sparkles" title="AI Assist" active={openMenu === 'ai'} data-tutorial-id="ai-assist-button" />
                <AnimatePresence>
                {openMenu === 'ai' && (
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        variants={dropdownVariants}
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-2 z-10"
                    >
                       <DropdownMenuItem text="Generate Ideas" icon="fa-lightbulb" onClick={onGenerateIdeas} loading={isGeneratingIdeas} />
                       <DropdownMenuItem text="Explain with Analogy" icon="fa-child-reaching" onClick={onGenerateAnalogy} loading={isGeneratingAnalogy} disabled={isRoot} />
                       <DropdownMenuItem text="Rephrase Node" icon="fa-pen-nib" onClick={onRephraseNode} loading={isRephrasing} disabled={isRoot} />
                       <DropdownMenuItem text="Extract Key Concepts" icon="fa-key" onClick={onExtractConcepts} loading={isExtractingConcepts} disabled={!hasChildren} />
                    </motion.div>
                )}
                </AnimatePresence>
            </div>

            {/* Style Menu */}
            <div className="relative" onMouseEnter={() => setOpenMenu('style')} onMouseLeave={() => setOpenMenu(null)}>
                 <ToolbarButton icon="fa-palette" title="Style Node" active={openMenu === 'style'} />
                 <AnimatePresence>
                 {openMenu === 'style' && (
                     <motion.div
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        variants={dropdownVariants}
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-2 z-10"
                    >
                        <div className="grid grid-cols-5 gap-2 p-1">
                            {PALETTE_COLORS.map(color => (
                                <motion.button
                                    key={color}
                                    onClick={() => onSetColor(color)}
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

            <ToolbarButton icon="fa-trash-can" onClick={handleDeleteClick} title="Delete node" disabled={isRoot} />
        </div>
    </div>
  );
};

export default NodeToolbar;