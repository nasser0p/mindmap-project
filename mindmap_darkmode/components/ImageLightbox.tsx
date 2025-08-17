import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageLightboxProps {
  imageUrl: string | null;
  onClose: () => void;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ imageUrl, onClose }) => {
  if (!imageUrl) {
    return null;
  }

  return (
    <AnimatePresence>
      {imageUrl && (
        <motion.div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center cursor-zoom-out"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.img
            src={imageUrl}
            alt="Expanded view"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl cursor-default"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the image itself
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
          <motion.button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 text-white rounded-full flex items-center justify-center hover:bg-white/40 transition-colors"
            title="Close image view (Esc)"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ delay: 0.1 }}
          >
            <i className="fa-solid fa-times text-xl"></i>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ImageLightbox;
