import React from 'react';
import { motion } from 'framer-motion';

interface SubjectMasteryDisplayProps {
    score: number;
    size?: 'large' | 'small';
    // For mobile, where the parent div handles the click
    onClick?: () => void;
    // For desktop menu actions
    onStartStudySprint?: () => void;
    onStartExam?: () => void;
}

const getMasteryColor = (score: number): { ring: string; text: string } => {
    if (score < 0.4) return { ring: 'text-red-500', text: 'text-red-600 dark:text-red-400' };
    if (score < 0.8) return { ring: 'text-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' };
    return { ring: 'text-green-500', text: 'text-green-600 dark:text-green-400' };
};

const ActionButton: React.FC<{ text: string, icon: string, onClick?: () => void }> = ({ text, icon, onClick }) => (
    <motion.button
        onClick={onClick}
        className="px-4 h-11 flex items-center gap-2 text-sm font-semibold bg-white/70 dark:bg-slate-800/70 backdrop-blur-md rounded-full shadow-lg border border-white/20 dark:border-slate-700/50 text-slate-700 dark:text-slate-200 hover:bg-white/90 dark:hover:bg-slate-800/90 transition-colors"
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.95 }}
    >
        <span role="img" aria-hidden="true">{icon}</span>
        {text}
    </motion.button>
);


const SubjectMasteryDisplay: React.FC<SubjectMasteryDisplayProps> = (props) => {
    const { score, onStartStudySprint, onStartExam, onClick, size = 'large' } = props;

    const validScore = (typeof score === 'number' && !isNaN(score)) ? Math.max(0, Math.min(1, score)) : 0;
    const displayScore = Math.round(validScore * 100);
    const colors = getMasteryColor(validScore);

    const isDesktop = size === 'large';

    const svgSize = isDesktop ? 96 : 40;
    const strokeWidth = isDesktop ? 8 : 4;
    const radius = (svgSize / 2) - (strokeWidth / 2);
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (validScore * circumference);

    // Mobile view remains a simple, clickable circle
    if (!isDesktop) {
        return (
            <div onClick={onClick} className="relative w-10 h-10">
                <svg height="100%" width="100%" viewBox="0 0 40 40" className="transform -rotate-90">
                    <circle stroke="#e5e7eb" className="dark:stroke-slate-700" fill="transparent" strokeWidth={4} r={18} cx={20} cy={20} />
                    <circle
                        stroke="currentColor" fill="transparent" strokeWidth={4} strokeDasharray={`${circumference} ${circumference}`}
                        style={{ strokeDashoffset, transition: 'stroke-dashoffset 1s ease-in-out' }}
                        strokeLinecap="round" r={18} cx={20} cy={20} className={colors.ring}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-sm font-bold ${colors.text}`}>{displayScore}%</span>
                </div>
            </div>
        );
    }
    
    // Desktop view shows the actions next to the score
    return (
        <div data-tutorial-id="mastery-display" className="fixed z-20 top-28 right-6 flex items-center gap-2">
            <ActionButton text="Study Sprint" icon="🚀" onClick={onStartStudySprint} />
            <ActionButton text="Take Exam" icon="🎓" onClick={onStartExam} />
            
            <div
                className="relative w-24 h-24 bg-white/70 dark:bg-slate-800/70 backdrop-blur-md rounded-full shadow-lg transition-transform duration-300 hover:scale-105 cursor-help border border-white/20 dark:border-slate-700/50"
                title={`Mastery Score: ${displayScore}%`}
            >
                <svg height="100%" width="100%" viewBox="0 0 96 96" className="transform -rotate-90">
                    <circle
                        stroke="#e5e7eb" className="dark:stroke-slate-700" fill="transparent"
                        strokeWidth={strokeWidth} r={radius} cx={svgSize / 2} cy={svgSize / 2}
                    />
                    <circle
                        stroke="currentColor" fill="transparent" strokeWidth={strokeWidth}
                        strokeDasharray={`${circumference} ${circumference}`}
                        style={{ strokeDashoffset, transition: 'stroke-dashoffset 1s ease-in-out' }}
                        strokeLinecap="round" r={radius} cx={svgSize / 2} cy={svgSize / 2}
                        className={colors.ring}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-3xl font-bold ${colors.text}`}>
                        {displayScore}<span className="text-xl font-medium">%</span>
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest -mt-1">Mastery</span>
                </div>
            </div>
        </div>
    );
};

export default SubjectMasteryDisplay;