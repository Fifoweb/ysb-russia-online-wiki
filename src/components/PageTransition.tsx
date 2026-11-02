import { motion, useReducedMotion } from 'framer-motion';
import { ReactNode } from 'react';

interface PageTransitionProps { children: ReactNode; className?: string; }

export default function PageTransition({ children, className = '' }: PageTransitionProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
