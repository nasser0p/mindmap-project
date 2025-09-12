import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FeedbackCategory } from '../types';
import html2canvas from 'html2canvas';
import Spinner from './Spinner';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (category: FeedbackCategory, summary: string, description: string, screenshotBlob: Blob | null) => Promise<void>;
}

const CategoryButton: React.FC<{ icon: string, text: string, onClick: () => void }> = ({ icon, text, onClick }) => (
    <button
        onClick={onClick}
        className="flex-1 p-6 bg-slate-100 dark:bg-slate-700 rounded-lg text-center hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
        <i className={`fa-solid ${icon} text-3xl mb-2 text-slate-600 dark:text-slate-300`}></i>
        <p className="font-semibold text-slate-800 dark:text-slate-100">{text}</p>
    </button>
);

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const [step, setStep] = useState<'category' | 'form' | 'loading' | 'thanks'>('category');
    const [category, setCategory] = useState<FeedbackCategory>('general');
    const [summary, setSummary] = useState('');
    const [description, setDescription] = useState('');
    const [screenshot, setScreenshot] = useState<string | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);

    const resetState = () => {
        setStep('category');
        setCategory('general');
        setSummary('');
        setDescription('');
        setScreenshot(null);
        setIsCapturing(false);
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    const handleCategorySelect = (selectedCategory: FeedbackCategory) => {
        setCategory(selectedCategory);
        setStep('form');
    };

    const handleCaptureScreenshot = async () => {
        setIsCapturing(true);
        try {
            const canvas = await html2canvas(document.body, {
                logging: false,
                useCORS: true,
                ignoreElements: (element) => element.id === 'feedback-modal-wrapper',
            });
            setScreenshot(canvas.toDataURL('image/png'));
        } catch (error) {
            console.error("Screenshot capture failed:", error);
            alert("Could not capture screenshot. Please try again or skip this step.");
        } finally {
            setIsCapturing(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStep('loading');
        
        let screenshotBlob: Blob | null = null;
        if (screenshot) {
            const res = await fetch(screenshot);
            screenshotBlob = await res.blob();
        }

        try {
            await onSubmit(category, summary, description, screenshotBlob);
            setStep('thanks');
        } catch (error) {
            console.error("Feedback submission failed:", error);
            alert("Failed to submit feedback. Please try again later.");
            setStep('form'); // Revert to form on error
        }
    };

    const renderStep = () => {
        switch (step) {
            case 'category':
                return (
                    <>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 text-center mb-2">Send Feedback</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-center mb-6">What kind of feedback do you have?</p>
                        <div className="flex gap-4">
                            <CategoryButton icon="fa-bug" text="Report a Bug" onClick={() => handleCategorySelect('bug')} />
                            <CategoryButton icon="fa-lightbulb" text="Suggest a Feature" onClick={() => handleCategorySelect('feature')} />
                            <CategoryButton icon="fa-star" text="General Feedback" onClick={() => handleCategorySelect('general')} />
                        </div>
                    </>
                );
            case 'form':
                return (
                    <form onSubmit={handleSubmit}>
                         <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">Tell us more</h2>
                         <div className="space-y-4">
                            <input
                                type="text"
                                value={summary}
                                onChange={(e) => setSummary(e.target.value)}
                                placeholder="Summary (e.g., 'Node toolbar disappears on zoom')"
                                required
                                className="w-full p-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                             <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Please provide as much detail as possible."
                                required
                                rows={5}
                                className="w-full p-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={handleCaptureScreenshot}
                                    disabled={isCapturing}
                                    className="px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md disabled:opacity-50"
                                >
                                    {isCapturing ? <Spinner fullScreen={false}/> : <><i className="fa-solid fa-camera mr-2"></i>Attach Screenshot</>}
                                </button>
                                {screenshot && <img src={screenshot} alt="Screenshot preview" className="w-16 h-auto rounded border border-slate-300" />}
                            </div>
                         </div>
                         <div className="mt-6 flex justify-end gap-3">
                            <button type="button" onClick={() => setStep('category')} className="px-4 py-2 text-sm font-semibold rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">Back</button>
                            <button type="submit" className="px-4 py-2 text-sm font-semibold bg-blue-500 text-white rounded-md hover:bg-blue-600">Submit</button>
                         </div>
                    </form>
                );
            case 'loading':
                return (
                    <div className="text-center py-12">
                        <Spinner fullScreen={false} />
                        <p className="mt-4 font-semibold text-slate-600 dark:text-slate-300">Submitting your feedback...</p>
                    </div>
                );
            case 'thanks':
                 return (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center mx-auto mb-4 text-3xl text-green-500">
                            <i className="fa-solid fa-check"></i>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Thank You!</h2>
                        <p className="text-slate-500 dark:text-slate-400 mt-2 mb-6">Your feedback helps us improve the app for everyone.</p>
                        <button onClick={handleClose} className="px-4 py-2 text-sm font-semibold bg-blue-500 text-white rounded-md hover:bg-blue-600">Close</button>
                    </div>
                );
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    id="feedback-modal-wrapper"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={handleClose}
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 20 }}
                        onClick={e => e.stopPropagation()}
                        className="relative w-full max-w-lg bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6"
                    >
                         <button onClick={handleClose} className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                            <i className="fa-solid fa-times"></i>
                        </button>
                         <AnimatePresence mode="wait">
                            <motion.div
                                key={step}
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -50 }}
                                transition={{ duration: 0.2 }}
                            >
                                {renderStep()}
                            </motion.div>
                         </AnimatePresence>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default FeedbackModal;
