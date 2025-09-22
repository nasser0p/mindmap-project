import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PALETTE_COLORS } from '../constants';
import { MindMapNode } from '../types';

interface NodeContextMenuProps {
    nodeId: string;
    node: MindMapNode;
    position: { x: number; y: number };
    onClose: () => void;
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
    isGeneratingIdeas: boolean;
    isRephrasing: boolean;
    isExtractingConcepts: boolean;
    isGeneratingAnalogy: boolean;
}

const MenuItem: React.FC<{
    icon: string;
    text: string;
    onClick: () => void;
    loading?: boolean;
    disabled?: boolean;
    isDanger?: boolean;
}> = ({ icon, text, onClick, loading = false, disabled = false, isDanger = false }) => (
    <button
        onClick={onClick}
        disabled={loading || disabled}
        className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isDanger
                ? 'text-red-600 dark:text-red-400 hover:bg-red-50/50 dark:hover:bg-red-900/50'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-slate-700/50'
        }`}
    >
        <div className="w-5 text-center">
            {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className={`fa-solid ${icon}`}></i>}
        </div>
        <span>{text}</span>
    </button>
);

const ColorPalette: React.FC<{ onSetColor: (color: string) => void }> = ({ onSetColor }) => (
    <div className="grid grid-cols-5 gap-2 p-2">
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
);

const NodeContextMenu: React.FC<NodeContextMenuProps> = (props) => {
    const {
        node, position, onClose, onAdd, onInsertParent, onDelete, onGenerateIdeas, onRephraseNode,
        onExtractConcepts, onGenerateAnalogy, onSetColor, onFocusNode, onTestBranch,
        isGeneratingIdeas, isRephrasing, isExtractingConcepts, isGeneratingAnalogy
    } = props;
    
    const menuRef = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState<React.CSSProperties>({
        opacity: 0,
        top: position.y,
        left: position.x,
    });

    const isRoot = !node.x && !node.y;
    const hasChildren = !!(node.children && node.children.length > 0);

    useLayoutEffect(() => {
        const menu = menuRef.current;
        if (menu) {
            const { innerWidth, innerHeight } = window;
            const menuRect = menu.getBoundingClientRect();
            let { x, y } = position;

            if (x + menuRect.width > innerWidth) {
                x = innerWidth - menuRect.width - 10;
            }
            if (y + menuRect.height > innerHeight) {
                y = innerHeight - menuRect.height - 10;
            }
            setStyle({ top: y, left: x, opacity: 1 });
        }
    }, [position]);

    return (
        <motion.div
            ref={menuRef}
            className="fixed z-50 w-64 glass-effect rounded-xl p-2 node-context-menu"
            style={style}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.1 }}
        >
            <button
                onClick={onClose}
                className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                title="Close"
                aria-label="Close context menu"
            >
                <i className="fa-solid fa-times"></i>
            </button>
            <div className="px-3 py-2 border-b border-white/20 dark:border-slate-700/50 mb-2">
                <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{node.text}</p>
            </div>
            
            <MenuItem icon="fa-plus" text="Add Child" onClick={onAdd} />
            <MenuItem icon="fa-diagram-predecessor" text="Insert Parent" onClick={onInsertParent} disabled={isRoot} />
            <MenuItem icon="fa-crosshairs" text="Focus on Branch" onClick={onFocusNode} disabled={isRoot} />
            <MenuItem icon="fa-vial-circle-check" text="Test this Branch" onClick={onTestBranch} disabled={isRoot} />
            
            <div className="h-px bg-white/20 dark:bg-slate-700/50 my-2"></div>

            <MenuItem icon="fa-wand-magic-sparkles" text="Generate Ideas" onClick={onGenerateIdeas} loading={isGeneratingIdeas} />
            <MenuItem icon="fa-child-reaching" text="Explain with Analogy" onClick={onGenerateAnalogy} loading={isGeneratingAnalogy} disabled={isRoot} />
            <MenuItem icon="fa-pen-nib" text="Rephrase Node" onClick={onRephraseNode} loading={isRephrasing} disabled={isRoot} />
            <MenuItem icon="fa-key" text="Extract Key Concepts" onClick={onExtractConcepts} loading={isExtractingConcepts} disabled={!hasChildren} />

            <div className="h-px bg-white/20 dark:bg-slate-700/50 my-2"></div>
            
            <ColorPalette onSetColor={onSetColor} />

            <div className="h-px bg-white/20 dark:bg-slate-700/50 my-2"></div>

            <MenuItem icon="fa-trash-can" text="Delete Node" onClick={onDelete} disabled={isRoot} isDanger />
        </motion.div>
    );
};

export default NodeContextMenu;