"use client";

import { motion, AnimatePresence } from "framer-motion";

interface ToastProps {
  message: string | null;
  onDismiss?: () => void;
}

export function Toast({ message }: ToastProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-line bg-panel/95 px-6 py-3 text-sm shadow-xl backdrop-blur"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
