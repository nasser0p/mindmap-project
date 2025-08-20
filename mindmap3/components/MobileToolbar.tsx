import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SubjectMasteryDisplay from './SubjectMasteryDisplay';

interface MobileToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  masteryScore: number;
  onStartStudySprint: () => void;
  onStartExam: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  toolMode: 'pan' | 'select';
  onToolChange: (mode: 'pan' | 'select') => void;
}

const MobileToolbarButton: React.FC<{ icon: string; onClick: (e: React.MouseEvent) => void; disabled?: boolean; title: string; isActive?: boolean }> = ({ icon, onClick, disabled, title, isActive }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`w-full h-full flex items-center justify-center rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-col text-xs gap-1.5 p-1 ${
        isActive ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50' : 'text-slate-600 dark:text-slate-200'
    }`}
  >
    <i className={`fa-solid ${icon} text-xl`}></i>
    <span className="font-semibold">{title}</span>
  </button>
);

const MobileToolbar: React.FC<MobileToolbarProps> = (props) => {
  const { toolMode, onToolChange, onUndo, onRedo, canUndo, canRedo, onStartExam, masteryScore, onStartStudySprint, theme, onToggleTheme } = props;
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
            setIsMoreMenuOpen(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20">
      <AnimatePresence>
        {isMoreMenuOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 w-[calc(100%-16px)] mb-2 p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-xl shadow-lg border border-slate-200/80 dark:border-slate-700/80"
          >
            <div className="grid grid-cols-4 gap-2">
                <MobileToolbarButton icon="fa-undo" onClick={onUndo} disabled={!canUndo} title="Undo" />
                <MobileToolbarButton icon="fa-redo" onClick={onRedo} disabled={!canRedo} title="Redo" />
                <MobileToolbarButton icon="fa-graduation-cap" onClick={onStartExam} title="Exam" />
                <MobileToolbarButton icon={theme === 'light' ? 'fa-sun' : 'fa-moon'} onClick={onToggleTheme} title="Theme" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.1)] p-1.5 border-t border-slate-200/80 dark:border-slate-700/80">
        <div className="grid grid-cols-5 h-16 gap-1.5">
            <MobileToolbarButton icon="fa-hand" onClick={() => onToolChange('pan')} title="Pan" isActive={toolMode === 'pan'} />
            <MobileToolbarButton icon="fa-vector-square" onClick={() => onToolChange('select')} title="Select" isActive={toolMode === 'select'} />
             <div className="flex flex-col items-center justify-center text-xs gap-1.5 font-semibold text-slate-600 dark:text-slate-200" onClick={onStartStudySprint}>
                <SubjectMasteryDisplay score={masteryScore} onClick={() => {}} size="small" />
                <span>Mastery</span>
             </div>
            <div /> {/* Spacer */}
            <MobileToolbarButton icon="fa-ellipsis-h" onClick={(e) => { e.stopPropagation(); setIsMoreMenuOpen(prev => !prev); }} title="More" isActive={isMoreMenuOpen} />
        </div>
      </div>
    </div>
  );
};

export default MobileToolbar;
