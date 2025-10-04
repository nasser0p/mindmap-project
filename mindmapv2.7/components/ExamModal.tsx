import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExamConfig, Question, ExamResult, QuestionType } from '../types';
import Spinner from './Spinner';

type ExamState = {
    // FIX: Added 'scope' property to match the state passed from App.tsx.
    view: 'closed' | 'scope' | 'config' | 'loading' | 'active' | 'grading' | 'results';
    scope: 'chapter' | 'subject';
    config: ExamConfig | null;
    questions: Question[];
    results: ExamResult | null;
    progress?: number;
    progressMessage?: string;
};

interface ExamModalProps {
  state: ExamState;
  branchExamConfig?: { nodeId: string; nodeText: string; } | null;
  onStart: (config: ExamConfig) => void;
  onSubmit: (answers: Map<string, string>, revealedHints: Set<string>) => void;
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

const ConfigView: React.FC<{ onStart: (config: ExamConfig) => void, branchExamConfig?: { nodeText: string } | null }> = ({ onStart, branchExamConfig }) => {
    const [config, setConfig] = useState<ExamConfig>({
        type: 'Quiz',
        numQuestions: 5,
        questionTypes: ['multiple-choice', 'short-answer', 'true-false', 'fill-in-the-blank'],
    });

    const handleTypeChange = (type: ExamConfig['type'], numQuestions: number) => {
        setConfig(prev => ({ ...prev, type, numQuestions }));
    };

    const handleQuestionTypeToggle = (type: QuestionType) => {
        const newTypes = config.questionTypes.includes(type)
            ? config.questionTypes.filter(t => t !== type)
            : [...config.questionTypes, type];
        
        if (newTypes.length === 0) {
            alert("You must select at least one question format.");
        } else {
            setConfig(prev => ({ ...prev, questionTypes: newTypes }));
        }
    };
    
    const questionTypeLabels: Record<QuestionType, string> = {
        'multiple-choice': 'Multiple Choice',
        'short-answer': 'Short Answer',
        'true-false': 'True/False',
        'fill-in-the-blank': 'Fill in Blank',
    };

    return (
        <div className="w-full max-w-lg mx-auto glass-effect rounded-xl p-6 md:p-8">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 text-center">
                {branchExamConfig ? `Branch Exam: ${branchExamConfig.nodeText}` : 'Setup Your Exam'}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-center mt-1 mb-8">
                {branchExamConfig ? 'Test your knowledge on this specific topic.' : 'Customize your test to focus on what you need to learn.'}
            </p>
            
            <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Exam Type</label>
                <div className="grid grid-cols-3 gap-3">
                    {(['Quiz', 'Midterm', 'Final'] as const).map((type, i) => (
                        <button key={type} onClick={() => handleTypeChange(type, (i+1)*5)} className={`text-center p-3 rounded-lg border transition-all ${config.type === type ? 'bg-blue-50/80 dark:bg-blue-950/80 border-blue-500 ring-2 ring-blue-200' : 'bg-white/50 dark:bg-slate-700/50 hover:bg-slate-50/70 dark:hover:bg-slate-600/50 border-slate-300 dark:border-slate-600'}`}>
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{type}</span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{(i+1)*5} Questions</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="mb-6">
                <label htmlFor="numQuestions" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Number of Questions: <span className="font-bold text-blue-600 dark:text-blue-400">{config.numQuestions}</span></label>
                <input
                    id="numQuestions"
                    type="range"
                    min="1"
                    max="20"
                    value={config.numQuestions}
                    onChange={(e) => setConfig(prev => ({ ...prev, numQuestions: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer 
                               [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                               [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
                />
            </div>
            
            <div className="mb-8">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Question Formats</label>
                <div className="grid grid-cols-2 gap-3">
                    {(['multiple-choice', 'short-answer', 'true-false', 'fill-in-the-blank'] as const).map(type => (
                        <button key={type} onClick={() => handleQuestionTypeToggle(type)} className={`py-3 px-4 rounded-lg text-sm font-semibold transition-colors border ${config.questionTypes.includes(type) ? 'bg-blue-500 text-white border-transparent' : 'bg-white/50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-50/70 dark:hover:bg-slate-600/50'}`}>
                           {questionTypeLabels[type]}
                        </button>
                    ))}
                </div>
            </div>

            <button
                onClick={() => onStart(config)}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 disabled:cursor-not-allowed"
                disabled={config.questionTypes.length === 0}
            >
                Start Exam
            </button>
        </div>
    );
};

const LoadingView: React.FC<{ progress?: number; message?: string }> = ({ progress = 0, message = "The AI is analyzing your notes..." }) => (
    <div className="w-full max-w-lg text-center text-white p-4">
        <Spinner fullScreen={false} />
        <h2 className="text-2xl font-bold mt-4">Generating your exam...</h2>
        <p className="mt-2 mb-4 h-5">{message}</p>
        <div className="w-full bg-slate-200/30 rounded-full h-2.5">
            <motion.div
                className="bg-white h-2.5 rounded-full"
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.5, ease: "linear" }}
            />
        </div>
    </div>
);

const ExamActiveView: React.FC<{ questions: Question[], onSubmit: (answers: Map<string, string>, revealedHints: Set<string>) => void }> = ({ questions, onSubmit }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Map<string, string>>(new Map());
    const [revealedHints, setRevealedHints] = useState<Set<string>>(new Set());
    const currentQuestion = questions[currentIndex];

    const handleAnswerChange = (answer: string) => {
        setAnswers(new Map(answers).set(currentQuestion.id, answer));
    };

    const handleNext = () => {
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    };
    
    const handlePrev = () => {
        if (currentIndex > 0) {
            // FIX: Corrected logic to go to the previous question instead of the next one.
            // @FIX: Corrected logic to go to the previous question instead of the next one.
            setCurrentIndex(currentIndex - 1);
        }
    };

    const handleRevealHint = () => {
        setRevealedHints(prev => new Set(prev).add(currentQuestion.id));
    };

    const handleSubmit = () => {
      if (window.confirm("Are you sure you want to submit your exam?")) {
        onSubmit(answers, revealedHints);
      }
    }

    const progressPercentage = ((currentIndex + 1) / questions.length) * 100;
    const isHintRevealed = revealedHints.has(currentQuestion.id);

    return (
        <div className="w-full max-w-3xl h-full flex flex-col glass-effect rounded-xl p-8 overflow-hidden">
            <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Question {currentIndex + 1} of {questions.length}</p>
                </div>
                <div className="w-full bg-slate-200/70 dark:bg-slate-700/70 rounded-full h-2.5">
                    <motion.div 
                        className="bg-blue-600 h-2.5 rounded-full" 
                        style={{ width: `${progressPercentage}%` }}
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercentage}%`}}
                        transition={{ type: 'spring', stiffness: 100 }}
                    />
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto py-4">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentIndex}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        <h3 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-4">{currentQuestion.questionText}</h3>
                        
                        {!isHintRevealed && (
                            <button onClick={handleRevealHint} className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400 font-semibold bg-yellow-100/50 dark:bg-yellow-900/30 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 px-3 py-1 rounded-full border border-yellow-200/80 dark:border-yellow-800/80 transition-all mb-4">
                                <i className="fa-solid fa-lightbulb"></i>
                                <span>Get a hint</span>
                            </button>
                        )}
                        
                        <AnimatePresence>
                        {isHintRevealed && (
                            <motion.div
                                initial={{ opacity: 0, height: 0, y: -10 }}
                                animate={{ opacity: 1, height: 'auto', y: 0 }}
                                exit={{ opacity: 0, height: 0, y: -10 }}
                                transition={{ duration: 0.3 }}
                                className="bg-yellow-50/70 dark:bg-yellow-950/70 border border-yellow-200 dark:border-yellow-800 p-3 rounded-lg text-sm text-yellow-800 dark:text-yellow-200 mb-6"
                            >
                                <p><span className="font-semibold">Hint:</span> {currentQuestion.hint}</p>
                            </motion.div>
                        )}
                        </AnimatePresence>

                        {(currentQuestion.type === 'multiple-choice' || currentQuestion.type === 'true-false') && (
                            <div className="space-y-3">
                                {currentQuestion.options?.map((option, index) => (
                                    <button
                                        key={index}
                                        onClick={() => handleAnswerChange(option)}
                                        className={`w-full text-left p-4 rounded-lg border-2 transition-all ${answers.get(currentQuestion.id) === option ? 'bg-blue-50/80 dark:bg-blue-950/80 border-blue-500' : 'bg-white/50 dark:bg-slate-700/50 hover:bg-slate-50/70 dark:hover:bg-slate-600/50 border-slate-200 dark:border-slate-600'}`}
                                    >
                                        <span className="font-semibold text-slate-700 dark:text-slate-200">{option}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {(currentQuestion.type === 'short-answer' || currentQuestion.type === 'fill-in-the-blank') && (
                            <textarea
                                value={answers.get(currentQuestion.id) || ''}
                                onChange={(e) => handleAnswerChange(e.target.value)}
                                placeholder="Type your answer here..."
                                className="w-full h-40 p-3 border-2 border-slate-300 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                            />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            <div className="mt-auto pt-6 border-t border-white/20 dark:border-slate-700/50 flex justify-between items-center">
                <button onClick={handlePrev} disabled={currentIndex === 0} className="px-6 py-2 bg-slate-200/70 dark:bg-slate-600/70 text-slate-700 dark:text-slate-200 font-semibold rounded-lg hover:bg-slate-300/70 dark:hover:bg-slate-500/70 disabled:opacity-50 disabled:cursor-not-allowed">
                    Previous
                </button>
                {currentIndex === questions.length - 1 ? (
                    <button onClick={handleSubmit} className="px-6 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 shadow-sm">
                        Submit Exam
                    </button>
                ) : (
                    <button onClick={handleNext} disabled={currentIndex === questions.length - 1} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        Next
                    </button>
                )}
            </div>
        </div>
    );
};

const ResultsView: React.FC<{
    results: ExamResult,
    onClose: () => void,
    isGrading: boolean,
    totalQuestions: number
}> = ({ results, onClose, isGrading, totalQuestions }) => {
    const incorrectAnswers = results.analysis.filter(a => !a.isCorrect);
    const scoreColorClass = results.score >= 80 ? 'text-green-500 dark:text-green-400' : results.score >= 60 ? 'text-yellow-500 dark:text-yellow-400' : 'text-red-500 dark:text-red-400';
    const numGraded = results.analysis.length;

    return (
        <div className="w-full max-w-3xl h-[90vh] flex flex-col glass-effect rounded-xl overflow-hidden">
            <div className="p-6 text-center border-b border-white/20 dark:border-slate-700/50">
                <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">{isGrading ? 'Grading Exam...' : 'Exam Results'}</h2>
                <p className={`text-6xl font-bold mt-4 mb-2 ${scoreColorClass}`}>{results.score}%</p>
                <p className="text-slate-500 dark:text-slate-400">
                    {isGrading ? (
                        `Graded ${numGraded} of ${totalQuestions} questions...`
                    ) : (
                        `You got ${results.analysis.length - incorrectAnswers.length} out of ${results.analysis.length} correct.`
                    )}
                </p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-black/5 dark:bg-white/5">
                <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-200">Review Your Answers</h3>
                {incorrectAnswers.map((answer, index) => (
                    <motion.div
                        key={index}
                        className="bg-white/50 dark:bg-slate-800/50 p-4 rounded-lg border border-red-200 dark:border-red-900/50"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <p className="font-semibold text-slate-800 dark:text-slate-100 mb-2">{answer.questionText}</p>
                        <div className="text-sm space-y-2">
                            <p><span className="font-semibold text-red-600 dark:text-red-400">Your Answer:</span> {answer.userAnswer}</p>
                            <p><span className="font-semibold text-green-600 dark:text-green-400">Correct Answer:</span> {answer.correctAnswer}</p>
                            <p className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700"><span className="font-semibold text-blue-600 dark:text-blue-400">Explanation:</span> {answer.explanation}</p>
                        </div>
                    </motion.div>
                ))}
                {isGrading && numGraded < totalQuestions && (
                    <div className="text-center p-8">
                        <Spinner fullScreen={false} />
                        <p className="mt-2 text-slate-500 dark:text-slate-400">More results are on the way...</p>
                    </div>
                )}
                {!isGrading && incorrectAnswers.length === 0 && (
                    <div className="text-center p-8 bg-green-50/50 dark:bg-green-950/50 rounded-lg">
                        <p className="text-5xl mb-4">🎉</p>
                        <p className="font-semibold text-green-700 dark:text-green-300">Congratulations! You answered all questions correctly!</p>
                    </div>
                )}
            </div>

            <div className="p-4 bg-transparent border-t border-white/20 dark:border-slate-700/50 flex justify-end">
                <button
                    onClick={onClose}
                    disabled={isGrading}
                    className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed"
                >
                    {isGrading ? 'Please Wait...' : 'Close & Review Map'}
                </button>
            </div>
        </div>
    );
};

const ExamModal: React.FC<ExamModalProps> = ({ state, branchExamConfig, onStart, onSubmit, onClose }) => {
    const { view, questions, results } = state;

    if (view === 'closed') return null;

    const isExamActive = view === 'active';
    const isGradingOrResults = view === 'grading' || view === 'results';

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4"
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={backdropVariants}
                transition={{ duration: 0.3 }}
                onClick={isExamActive ? undefined : onClose}
            >
                <motion.div
                    className={`${isExamActive || isGradingOrResults ? 'w-full h-full' : 'max-w-lg'} relative`}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={modalVariants}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    onClick={e => e.stopPropagation()} // Prevent close on modal click
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={view}
                            className="w-full h-full flex items-center justify-center"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            {view === 'config' && <ConfigView onStart={onStart} branchExamConfig={branchExamConfig} />}
                            {view === 'loading' && <LoadingView progress={state.progress} message={state.progressMessage} />}
                            {view === 'active' && questions.length > 0 && <ExamActiveView questions={questions} onSubmit={onSubmit} />}
                            {isGradingOrResults && results && (
                                <ResultsView
                                    results={results}
                                    onClose={onClose}
                                    isGrading={view === 'grading'}
                                    totalQuestions={questions.length}
                                />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default ExamModal;