import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StudySprint, StudyStep, Question, QuestionType, StudyStepType } from '../types';
import Spinner from './Spinner';

type StudySprintState = {
    view: 'closed' | 'config' | 'loading' | 'active' | 'completed';
    sprint: StudySprint | null;
    isLoading: boolean;
};

interface StudySprintModalProps {
  state: StudySprintState;
  onStart: (duration: number) => void;
  onClose: () => void;
}

const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
};

const modalVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 },
};

const ConfigView: React.FC<{ onStart: (duration: number) => void }> = ({ onStart }) => {
    const [duration, setDuration] = useState(30);

    return (
        <div className="w-full max-w-lg mx-auto glass-effect rounded-xl p-8">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 text-center">Plan Your Study Sprint</h2>
            <p className="text-slate-500 dark:text-slate-400 text-center mt-2 mb-6">Let the AI create a focused, timed study session to improve your weakest areas.</p>
            
            <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">How much time do you have?</label>
                <div className="grid grid-cols-3 gap-3">
                    {[15, 30, 45].map((time) => (
                        <button key={time} onClick={() => setDuration(time)} className={`p-4 rounded-lg border-2 transition-all ${duration === time ? 'bg-blue-50/80 dark:bg-blue-950/80 border-blue-500' : 'bg-white/50 dark:bg-slate-800/50 hover:bg-slate-50/70 dark:hover:bg-slate-700/70 border-slate-200'}`}>
                            <span className="font-semibold text-slate-800 dark:text-slate-100 text-lg">{time}</span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">Minutes</span>
                        </button>
                    ))}
                </div>
            </div>

            <button
                onClick={() => onStart(duration)}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
                Generate My Plan
            </button>
        </div>
    );
};

const LoadingView: React.FC = () => (
    <div className="text-center text-white">
        <Spinner fullScreen={false} />
        <h2 className="text-2xl font-bold mt-4 animate-pulse">Building your study plan...</h2>
        <p className="mt-2">The AI is preparing a personalized session just for you.</p>
    </div>
);

const stepIcons: Record<StudyStepType, string> = {
    FLASHCARD_REVIEW: 'fa-layer-group',
    FOCUSED_DEEP_DIVE: 'fa-book-open',
    CONSOLIDATION_QUIZ: 'fa-question-circle',
};

const QuizComponent: React.FC<{ questions: Question[] }> = ({ questions }) => {
    const [answers, setAnswers] = useState<Map<string, string>>(new Map());
    const [submitted, setSubmitted] = useState(false);

    const handleAnswerChange = (questionId: string, answer: string) => {
        setAnswers(new Map(answers).set(questionId, answer));
    };

    return (
        <div className="space-y-4 mt-4">
        {questions.map((q, index) => (
            <div key={q.id} className="bg-slate-50/70 p-4 rounded-lg border border-slate-200">
                <p className="font-semibold text-slate-800 mb-2">{index + 1}. {q.questionText}</p>
                {q.type === 'multiple-choice' ? (
                    <div className="grid grid-cols-2 gap-2">
                        {q.options?.map(opt => (
                            <button
                                key={opt}
                                onClick={() => !submitted && handleAnswerChange(q.id, opt)}
                                disabled={submitted}
                                className={`p-2 rounded-md border text-sm text-left transition-colors ${
                                    answers.get(q.id) === opt ? 'bg-blue-100 border-blue-300' : 'bg-white hover:bg-slate-100 border-slate-200'
                                } ${submitted ? 'cursor-not-allowed' : ''}`}
                            >
                                {submitted && answers.get(q.id) === opt && (q.correctAnswer === opt ? '✅' : '❌')} {opt}
                            </button>
                        ))}
                    </div>
                ) : (
                    <textarea 
                        value={answers.get(q.id) || ''}
                        onChange={e => handleAnswerChange(q.id, e.target.value)}
                        disabled={submitted}
                        placeholder="Your answer..."
                        className="w-full p-2 border rounded-md"
                    />
                )}
                {submitted && answers.get(q.id) !== q.correctAnswer && (
                    <div className="mt-2 text-sm bg-green-50 p-2 rounded-md border border-green-200 text-green-800">
                        <span className="font-semibold">Correct Answer:</span> {q.correctAnswer}
                    </div>
                )}
            </div>
        ))}
         <div className="text-center pt-2">
            {!submitted && (
                <button onClick={() => setSubmitted(true)} className="px-4 py-1.5 bg-green-500 text-white font-semibold rounded-md hover:bg-green-600">Check Answers</button>
            )}
        </div>
        </div>
    );
};

const ActiveSprintView: React.FC<{ sprint: StudySprint, onComplete: () => void }> = ({ sprint, onComplete }) => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const currentStep = sprint.steps[currentStepIndex];
    const isLastStep = currentStepIndex === sprint.steps.length - 1;

    return (
         <div className="w-full max-w-3xl h-full flex flex-col glass-effect rounded-xl p-6 md:p-8 overflow-hidden">
            {/* Header and Progress */}
            <div className="mb-4 flex-shrink-0">
                <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Step {currentStepIndex + 1} of {sprint.steps.length}</p>
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400"><i className="fa-regular fa-clock mr-1.5"></i>{currentStep.duration} min</p>
                </div>
                <div className="w-full bg-slate-200/70 rounded-full h-2.5">
                    <div className="flex h-full">
                    {sprint.steps.map((step, index) => (
                        <motion.div
                            key={index}
                            className={`h-full rounded-full ${index <= currentStepIndex ? 'bg-blue-600' : 'bg-slate-200/70'}`}
                            style={{ width: `${(1 / sprint.steps.length) * 100}%` }}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                        />
                    ))}
                    </div>
                </div>
            </div>
            {/* Step Content */}
            <div className="flex-1 overflow-y-auto py-4 -mx-4 px-4">
                 <AnimatePresence mode="wait">
                    <motion.div
                        key={currentStepIndex}
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="flex items-center gap-3 mb-3 text-slate-500 dark:text-slate-300">
                            <i className={`fa-solid ${stepIcons[currentStep.type]} text-xl`}></i>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{currentStep.title}</h2>
                        </div>
                        <p className="text-slate-600 dark:text-slate-200 whitespace-pre-wrap">{currentStep.instructions}</p>
                        {currentStep.type === 'CONSOLIDATION_QUIZ' && currentStep.quiz && (
                            <QuizComponent questions={currentStep.quiz} />
                        )}
                    </motion.div>
                 </AnimatePresence>
            </div>
            {/* Navigation */}
            <div className="mt-auto pt-6 border-t border-white/20 dark:border-slate-700/50 flex justify-between items-center flex-shrink-0">
                 <button onClick={() => setCurrentStepIndex(i => i - 1)} disabled={currentStepIndex === 0} className="px-6 py-2 bg-slate-200/70 text-slate-700 font-semibold rounded-lg hover:bg-slate-300/70 disabled:opacity-50 disabled:cursor-not-allowed">
                    Previous
                </button>
                {isLastStep ? (
                    <button onClick={onComplete} className="px-6 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 shadow-sm">
                        Complete Sprint
                    </button>
                ) : (
                    <button onClick={() => setCurrentStepIndex(i => i + 1)} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">
                        Next Step
                    </button>
                )}
            </div>
        </div>
    );
};

const CompletedView: React.FC<{ onClose: () => void }> = ({ onClose }) => (
    <div className="w-full max-w-lg mx-auto glass-effect rounded-xl p-8 text-center">
        <p className="text-6xl mb-4">🎉</p>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Study Sprint Complete!</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2 mb-6">Great work! You've taken a big step in mastering this subject. Keep up the momentum!</p>
        <button onClick={onClose} className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700">
            Back to Mind Map
        </button>
    </div>
);


const StudySprintModal: React.FC<StudySprintModalProps> = ({ state, onStart, onClose }) => {
    const { view, sprint, isLoading } = state;
    const [modalState, setModalState] = useState(view);

    // Sync internal state with prop
    useEffect(() => {
        setModalState(view);
    }, [view]);

    const handleComplete = () => {
        setModalState('completed');
    }

    if (view === 'closed') return null;
    const isInteractive = view === 'active';

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4"
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={backdropVariants}
                transition={{ duration: 0.3 }}
                onClick={isInteractive ? undefined : onClose}
            >
                <motion.div
                    className={`${isInteractive ? 'w-full h-full' : 'max-w-lg'} relative`}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={modalVariants}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    onClick={e => e.stopPropagation()} // Prevent close on modal click
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={modalState}
                            className="w-full h-full flex items-center justify-center"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            {modalState === 'config' && <ConfigView onStart={onStart} />}
                            {modalState === 'loading' && <LoadingView />}
                            {modalState === 'active' && sprint && <ActiveSprintView sprint={sprint} onComplete={handleComplete} />}
                            {modalState === 'completed' && <CompletedView onClose={onClose} />}
                        </motion.div>
                    </AnimatePresence>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default StudySprintModal;