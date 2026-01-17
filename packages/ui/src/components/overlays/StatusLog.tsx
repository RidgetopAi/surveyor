/**
 * StatusLog - Animated scrolling log of scan status messages
 */

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowRight, Info } from 'lucide-react';
import { scanLogEntryVariants } from '../../utils/animations';
import type { LogEntry } from '../../stores/scan-store';

interface StatusLogProps {
  entries: LogEntry[];
  maxEntries?: number;
}

function LogIcon({ type }: { type: LogEntry['type'] }) {
  switch (type) {
    case 'success':
      return <Check className="w-3.5 h-3.5 text-status-healthy" />;
    case 'progress':
      return <ArrowRight className="w-3.5 h-3.5 text-accent-blue" />;
    case 'info':
    default:
      return <Info className="w-3.5 h-3.5 text-text-muted" />;
  }
}

export function StatusLog({ entries, maxEntries = 4 }: StatusLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries.length]);

  // Show only the most recent entries
  const visibleEntries = entries.slice(-maxEntries);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="h-px bg-surface-3" />
      <div
        ref={containerRef}
        className="max-h-28 overflow-hidden space-y-1.5"
      >
        <AnimatePresence mode="popLayout">
          {visibleEntries.map((entry) => (
            <motion.div
              key={entry.id}
              variants={scanLogEntryVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              layout
              className="flex items-center gap-2 text-xs"
            >
              <LogIcon type={entry.type} />
              <span
                className={`${
                  entry.type === 'progress'
                    ? 'text-text-primary'
                    : 'text-text-secondary'
                }`}
              >
                {entry.message}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
