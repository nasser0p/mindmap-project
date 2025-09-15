import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MindMapNode, GradedAnswer, Question } from '../types';
import Spinner from './Spinner';

type HotspotContent = {
    view: 'main' | 'explaining' | 'quizzing' | 'loading';
    explanation?: string;
    quiz?: Question;
    quizAnswer?: string;
    isQuizCorrect?: boolean;
};

interface TopicHotspotProps {
    node: MindMapNode;
    incorrectQuestions: GradedAnswer[];
    content: HotspotContent | null;
    isInGuidedReview: boolean;
    onClose: () => void;
    onMarkAsReviewed: () => void;
    onExplainDifferently: (nodeText: string) => void;
    onQuizAgain: (nodeText: string) => void;
    onAdvance: () => void;
    onBackToMain: () => void;
}

const ActionButton: React.FC<{ text: string, icon: string, onClick: () => void }> = ({ text, icon, onClick }) => (
    <button onClick={onClick} className="flex-1 flex flex-col items-center justify-center gap-1.5 p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600">
        <i className={`fa-solid ${icon} text-lg`}></i>
        <span className="text-xs font-semibold">{text}</span>
    </button>
);

const HotspotQuiz: React.FC<{ quiz: Question, onBack: () => void }> = ({ quiz, onBack }) => {
    const [answer, setAnswer] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const isCorrect = submitted && answer.toLowerCase().trim() === quiz.correctAnswer.toLowerCase().trim();

    return (
        <div className="p-4">
            <h4 className="font-bold text-slate-800 mb-2">Pop Quiz!</h4>
            <p className="text-sm text-slate-700 mb-3">{quiz.questionText}</p>
            {quiz.type === 'multiple-choice' && quiz.options ? (
                <div className="grid grid-cols-2 gap-2">
                    {quiz.options.map(opt => (
                        <button key={opt} onClick={() => setAnswer(opt)} disabled={submitted} className={`p-2 rounded-md text-sm text-left border ${answer === opt ? 'bg-blue-100 border-blue-300' : 'bg-white hover:bg-slate-50 border-slate-200'} ${submitted ? 'cursor-not-allowed' : ''}`}>
                            {submitted && answer === opt && (quiz.correctAnswer === opt ? '✅' : '❌')} {opt}
                        </button>
                    ))}
                </div>
            ) : (
                <textarea value={answer} onChange={e => setAnswer(e.target.value)} disabled={submitted} className="w-full p-2 border rounded-md" placeholder="Your answer..." />
            )}
             <div className="mt-3 flex items-center gap-2">
                <button onClick={() => setSubmitted(true)} disabled={!answer || submitted} className="px-3 py-1 text-sm font-semibold text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:bg-slate-300">Check Answer</button>
                <button onClick={onBack} className="px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-md">Back</button>
            </div>
            <AnimatePresence>
                {submitted && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`mt-3 p-2 text-sm rounded-md border ${isCorrect ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                        {isCorrect ? "That's right!" : <><strong>Correct Answer:</strong> {quiz.correctAnswer}</>}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const TopicHotspot: React.FC<TopicHotspotProps> = (props) => {
    const { node, incorrectQuestions, content, isInGuidedReview, onClose, onMarkAsReviewed, onExplainDifferently, onQuizAgain, onAdvance, onBackToMain } = props;

    return (
        <motion.div
            className="w-[360px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
            style={{ transformOrigin: 'bottom center' }}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 250 }}
        >
            {/* Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-start gap-2">
                <div>
                    <p className="text-xs font-semibold text-red-500 uppercase tracking-wide">Review Topic</p>
                    <h3 className="font-bold text-lg text-slate-800">{node.text}</h3>
                </div>
                <button onClick={onClose} className="w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                    <i className="fa-solid fa-times"></i>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={content?.view}
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.2 }}
                        className="h-full"
                    >
                        {content?.view === 'loading' && <div className="h-full flex items-center justify-center"><Spinner fullScreen={false}/></div>}

                        {content?.view === 'main' && (
                             <div className="p-4 h-full overflow-y-auto">
                                {incorrectQuestions.map((q, i) => (
                                    <div key={i} className="mb-3 text-sm">
                                        <p className="font-semibold text-slate-700 mb-1">{q.questionText}</p>
                                        <p><span className="font-medium text-red-600">Your Answer:</span> {q.userAnswer}</p>
                                        <p><span className="font-medium text-green-600">Correct:</span> {q.correctAnswer}</p>
                                        <p className="mt-1 text-xs text-slate-500 bg-slate-100 p-1.5 rounded"><span className="font-semibold">AI Explanation:</span> {q.explanation}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                        {content?.view === 'explaining' && (
                             <div className="p-4">
                                <h4 className="font-bold text-slate-800 mb-2">Here's another way to think about it...</h4>
                                <p className="text-sm text-slate-700 mb-3">{content.explanation}</p>
                                <button onClick={onBackToMain} className="px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-md">Back</button>
                             </div>
                        )}
                        {content?.view === 'quizzing' && content.quiz && (
                            <HotspotQuiz quiz={content.quiz} onBack={onBackToMain} />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Footer Actions */}
            <div className="p-3 bg-slate-50 border-t border-slate-200">
                {content?.view === 'main' ? (
                     isInGuidedReview ? (
                        <div className="flex items-center gap-2">
                             <ActionButton text="Explain It" icon="fa-brain" onClick={() => onExplainDifferently(node.text)} />
                             <ActionButton text="Quiz Me" icon="fa-question" onClick={() => onQuizAgain(node.text)} />
                             <button onClick={onAdvance} className="flex-1 h-12 flex items-center justify-center gap-2 px-4 rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600 transition-colors">
                                 <span>Next</span>
                                 <i className="fa-solid fa-arrow-right"></i>
                             </button>
                        </div>
                    ) : (
                         <div className="flex items-center gap-2">
                            <ActionButton text="Explain It" icon="fa-brain" onClick={() => onExplainDifferently(node.text)} />
                            <ActionButton text="Quiz Me" icon="fa-question" onClick={() => onQuizAgain(node.text)} />
                            <button onClick={onMarkAsReviewed} className="flex-1 h-12 flex items-center justify-center gap-2 px-4 rounded-lg bg-green-500 text-white font-semibold hover:bg-green-600 transition-colors">
                                <i className="fa-solid fa-check"></i>
                                <span>Got It!</span>
                            </button>
                        </div>
                    )
                ) : (
                     <div className="text-center">
                        <button onClick={onBackToMain} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-md">
                            Return to Review
                        </button>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default TopicHotspot;