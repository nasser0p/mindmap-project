import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MindMapNode } from '../types';

const MasteryCircle: React.FC<{ score: number }> = React.memo(({ score }) => {
    const validScore = Math.max(0, Math.min(1, score || 0));
    const displayScore = Math.round(validScore * 100);

    const getColor = (s: number) => {
        if (s < 0.4) return 'text-red-500';
        if (s < 0.8) return 'text-yellow-500';
        return 'text-green-500';
    };
    const colorClass = getColor(validScore);

    const size = 24;
    const strokeWidth = 3;
    const radius = (size / 2) - (strokeWidth / 2);
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (validScore * circumference);

    return (
        <div className="relative flex-shrink-0" style={{ width: size, height: size }} title={`Branch Mastery: ${displayScore}%`}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                <circle
                    className="text-slate-200 dark:text-slate-600"
                    stroke="currentColor"
                    fill="transparent"
                    strokeWidth={strokeWidth}
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
                <motion.circle
                    className={colorClass}
                    stroke="currentColor"
                    fill="transparent"
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeLinecap="round"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                />
            </svg>
             <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${colorClass}`}>
                {displayScore}
            </span>
        </div>
    );
});

interface NavItemProps {
  node: MindMapNode;
  onNavigate: (nodeId: string) => void;
  masteryScore: number;
}

const NavItem: React.FC<NavItemProps> = ({ node, onNavigate, masteryScore }) => {
  return (
    <motion.button
      onClick={() => onNavigate(node.id)}
      className="w-full text-left p-3 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex items-center gap-3">
        <div 
          className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
          style={{ backgroundColor: node.color }}
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{node.text}</p>
        </div>
        <MasteryCircle score={masteryScore} />
      </div>
    </motion.button>
  );
};

interface NavigationPanelProps {
  path: MindMapNode[];
  displayRoot: MindMapNode;
  onNavigate: (nodeId: string | null) => void;
  branchMasteryScores: Map<string, number>;
}

const NavigationPanel: React.FC<NavigationPanelProps> = ({ path, displayRoot, onNavigate, branchMasteryScores }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isAtRoot = path.length <= 1;

  return (
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
      className="absolute top-0 left-0 bottom-0 z-20 h-full flex items-center"
    >
      <motion.div
        animate={{ width: isCollapsed ? 0 : 320 }}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        className="h-full bg-white/60 dark:bg-slate-800/70 backdrop-blur-lg border-r border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
      >
        <div className="p-4 flex-shrink-0 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Navigator</h2>
             {/* Breadcrumb */}
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap overflow-x-auto no-scrollbar">
                <button onClick={() => onNavigate(null)} className="hover:text-blue-500">Home</button>
                {path.slice(1).map((node, index) => (
                    <React.Fragment key={node.id}>
                        <span className="mx-1">/</span>
                        <button 
                            onClick={() => onNavigate(node.id)}
                            className={index === path.length - 2 ? "font-semibold text-slate-700 dark:text-slate-200" : "hover:text-blue-500"}
                        >
                            {node.text}
                        </button>
                    </React.Fragment>
                ))}
            </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
             {/* Go Up Button */}
            {!isAtRoot && (
                <button
                    onClick={() => onNavigate(path.length > 2 ? path[path.length - 2].id : null)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors text-sm font-semibold"
                >
                    <i className="fa-solid fa-arrow-turn-up w-4 text-center"></i>
                    <span>Go Up</span>
                </button>
            )}
            <AnimatePresence mode="wait">
                {(displayRoot.children && displayRoot.children.length > 0) ? (
                    displayRoot.children.map(child => (
                        <NavItem 
                            key={child.id} 
                            node={child} 
                            onNavigate={onNavigate} 
                            masteryScore={branchMasteryScores.get(child.id) || 0}
                        />
                    ))
                ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="text-center text-slate-400 pt-10 text-sm"
                    >
                        <i className="fa-solid fa-leaf text-2xl mb-2"></i>
                        <p>No child nodes.</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
      </motion.div>
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-6 h-16 bg-white/60 dark:bg-slate-800/70 backdrop-blur-md border-y border-r border-slate-200 dark:border-slate-700 rounded-r-lg flex items-center justify-center text-slate-500 dark:text-slate-400"
        title={isCollapsed ? "Open Navigator" : "Collapse Navigator"}
      >
        <motion.i 
            animate={{ rotate: isCollapsed ? 180 : 0 }}
            className="fa-solid fa-chevron-left" 
        />
      </button>
    </motion.div>
  );
};

export default NavigationPanel;