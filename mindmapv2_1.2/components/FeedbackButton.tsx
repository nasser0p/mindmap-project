import React from 'react';
import { motion } from 'framer-motion';

interface FeedbackButtonProps {
    onClick: () => void;
}

const FeedbackButton: React.FC<FeedbackButtonProps> = ({ onClick }) => {
    return (
        <motion.button
            onClick={onClick}
            className="fixed bottom-6 right-6 z-20 w-16 h-16 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-all duration-300"
            title="Send Feedback"
            aria-label="Open feedback form"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.5 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
        >
            <i className="fa-solid fa-comment-dots text-2xl"></i>
        </motion.button>
    );
};

export default FeedbackButton;
