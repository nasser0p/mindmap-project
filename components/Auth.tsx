import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, googleProvider } from '../firebase';

const Auth: React.FC<{ onClose: () => void; }> = ({ onClose }) => {
    const [error, setError] = useState<string | null>(null);

    const handleGoogleSignIn = async () => {
        setError(null);
        try {
            await auth.signInWithPopup(googleProvider);
            // No need to call onClose here, as the AuthProvider will trigger a re-render of App.tsx
        } catch (err) {
            console.error("Google Sign-In Error:", err);
            setError("Failed to sign in with Google. Please try again.");
        }
    };
    
    return (
        <motion.div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="relative w-full max-w-sm p-8 bg-white rounded-2xl shadow-xl text-center"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 25 }}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
                    aria-label="Close"
                >
                    <i className="fa-solid fa-times"></i>
                </button>
                <i className="fa-solid fa-sitemap text-5xl text-blue-500 mb-4"></i>
                <h1 className="text-3xl font-bold text-slate-800">Get Started</h1>
                <p className="text-slate-500 mt-2 mb-8">Sign in to create, save, and access your mind maps from anywhere.</p>
                
                {error && <p className="bg-red-100 text-red-700 p-3 rounded-lg mb-6">{error}</p>}

                <button
                    onClick={handleGoogleSignIn}
                    className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                    <i className="fa-brands fa-google text-red-500 text-lg"></i>
                    <span>Sign in with Google</span>
                </button>
                <p className="text-xs text-slate-400 mt-8">By signing in, you agree to our terms and conditions.</p>
            </motion.div>
        </motion.div>
    );
};

export default Auth;