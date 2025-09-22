import React, { useState, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TutorialNudgeProps {
  targetId: string;
  message: string;
  onNext: () => void;
  onSkip: () => void;
  isLastStep: boolean;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

const TutorialNudge: React.FC<TutorialNudgeProps> = ({ targetId, message, onNext, onSkip, isLastStep, placement = 'bottom' }) => {
  const [position, setPosition] = useState<{ top: number; left: number; width: number, height: number } | null>(null);
  const nudgeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const targetElement = document.querySelector(`[data-tutorial-id='${targetId}']`);
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      setPosition({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });

      // Avoid scrolling if element is already in view
      if (rect.top < 0 || rect.bottom > window.innerHeight || rect.left < 0 || rect.right > window.innerWidth) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
      
    } else {
        // If target is not found (e.g., it hasn't rendered yet), skip the step
        // This can happen if a user action is required before the element appears
        console.warn(`Tutorial nudge target "${targetId}" not found. Skipping step.`);
        onNext();
    }
  }, [targetId, onNext]);

  if (!position) {
    return null;
  }

  const getNudgePosition = () => {
    const nudgeHeight = nudgeRef.current?.offsetHeight || 100;
    const nudgeWidth = nudgeRef.current?.offsetWidth || 250;
    const offset = 12;

    switch (placement) {
      case 'top':
        return { top: position.top - nudgeHeight - offset, left: position.left + position.width / 2 - nudgeWidth / 2 };
      case 'left':
        return { top: position.top + position.height / 2 - nudgeHeight / 2, left: position.left - nudgeWidth - offset };
      case 'right':
        return { top: position.top + position.height / 2 - nudgeHeight / 2, left: position.left + position.width + offset };
      case 'bottom':
      default:
        return { top: position.top + position.height + offset, left: position.left + position.width / 2 - nudgeWidth / 2 };
    }
  };

  const nudgePos = getNudgePosition();

  return (
    <AnimatePresence>
      <motion.div
        ref={nudgeRef}
        className="fixed z-[9999] w-64 bg-slate-800 text-white rounded-lg shadow-2xl p-4 tutorial-nudge"
        style={{
          top: nudgePos.top,
          left: nudgePos.left,
          maxWidth: 'calc(100vw - 32px)',
        }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
      >
        <div className={`tutorial-arrow tutorial-arrow-${placement}`} />
        <p className="text-sm mb-3">{message}</p>
        <div className="flex items-center gap-2">
            <button
              onClick={onNext}
              className="flex-1 py-1.5 bg-blue-500 text-white text-sm font-semibold rounded-md hover:bg-blue-600 transition-colors"
            >
              {isLastStep ? 'Finish' : 'Next'}
            </button>
             <button
              onClick={onSkip}
              className="px-3 py-1.5 text-slate-300 hover:bg-slate-700 text-xs font-semibold rounded-md transition-colors"
            >
              Skip
            </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TutorialNudge;
