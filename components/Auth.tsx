import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { auth as firebaseAuth, googleProvider } from '../firebase';
import Spinner from './Spinner';

const Auth: React.FC<{ onGoToLanding: () => void; }> = ({ onGoToLanding }) => {
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError(null);
        try {
            await firebaseAuth.signInWithPopup(googleProvider);
        } catch (err) {
            console.error("Google Sign-In Error:", err);
            setError("Failed to sign in with Google. Please try again.");
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="w-screen h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
            <motion.div
                className="relative w-full max-w-sm"
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
                 <button
                    onClick={onGoToLanding}
                    className="absolute top-0 -left-12 flex items-center gap-2 text-slate-500 hover:text-blue-500 font-semibold transition-colors hidden md:flex"
                    aria-label="Back to landing page"
                >
                    <i className="fa-solid fa-arrow-left"></i>
                    Back
                </button>

                <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800">
                    <div className="text-center">
                        <i className="fa-solid fa-sitemap text-5xl text-blue-500 mb-4"></i>
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Sign In to Continue</h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-2 mb-8">
                            Use your Google account to access your mind maps.
                        </p>
                    </div>
                    
                    {error && <p className="bg-red-100 text-red-700 p-3 rounded-lg mb-4 text-sm text-center">{error}</p>}

                    <button
                        onClick={handleGoogleSignIn}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                        {loading ? <Spinner fullScreen={false} /> : (
                            <>
                                <i className="fa-brands fa-google text-red-500 text-lg"></i>
                                <span>Continue with Google</span>
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default Auth;
