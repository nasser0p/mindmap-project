import React from 'react';

interface SubjectMasteryDisplayProps {
    score: number; // A value from 0 to 1
    onClick: () => void;
}

const getMasteryColor = (score: number): { ring: string; text: string } => {
    if (score < 0.4) return { ring: 'text-red-500', text: 'text-red-600 dark:text-red-400' };
    if (score < 0.8) return { ring: 'text-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' };
    return { ring: 'text-green-500', text: 'text-green-600 dark:text-green-400' };
};

const SubjectMasteryDisplay: React.FC<SubjectMasteryDisplayProps> = ({ score, onClick }) => {
    // Gracefully handle NaN or undefined scores, and clamp between 0 and 1.
    const validScore = (typeof score === 'number' && !isNaN(score)) ? Math.max(0, Math.min(1, score)) : 0;

    const displayScore = Math.round(validScore * 100);
    const colors = getMasteryColor(validScore);

    const svgSize = 96; // Corresponds to w-24, h-24
    const strokeWidth = 8;
    const radius = (svgSize / 2) - (strokeWidth / 2);
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (validScore * circumference);

    return (
        <div
            onClick={onClick}
            className="fixed top-28 right-6 z-20 cursor-pointer group"
            title="Click for an AI-powered progress report"
        >
            <div className="relative w-24 h-24 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-full shadow-xl transition-transform duration-300 group-hover:scale-105">
                <svg
                    height="100%"
                    width="100%"
                    viewBox={`0 0 ${svgSize} ${svgSize}`}
                    className="transform -rotate-90"
                >
                    <circle
                        stroke="#e5e7eb"
                        className="dark:stroke-slate-700"
                        fill="transparent"
                        strokeWidth={strokeWidth}
                        r={radius}
                        cx={svgSize / 2}
                        cy={svgSize / 2}
                    />
                    <circle
                        stroke="currentColor"
                        fill="transparent"
                        strokeWidth={strokeWidth}
                        strokeDasharray={`${circumference} ${circumference}`}
                        style={{ strokeDashoffset, transition: 'stroke-dashoffset 1s ease-in-out' }}
                        strokeLinecap="round"
                        r={radius}
                        cx={svgSize / 2}
                        cy={svgSize / 2}
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