/**
 * ScanProgress - Animated overlay showing scan progress with grid visualization
 */

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useScanStore, type ScanProgress as ScanProgressState } from '../../stores/scan-store';
import { useUIStore } from '../../stores/ui-store';
import {
  scanGridContainerVariants,
  scanGridCellVariants,
  scanOverlayVariants,
  aiGlowVariants,
} from '../../utils/animations';
import { StatusLog } from './StatusLog';

const GRID_COLS = 12;
const GRID_ROWS = 6;
const TOTAL_CELLS = GRID_COLS * GRID_ROWS;

interface ScanProgressProps {
  isVisible: boolean;
}

interface GridCellProps {
  index: number;
  isFilled: boolean;
  isAnalyzing: boolean;
  isAIEnabled: boolean;
  reducedMotion: boolean;
}

function GridCell({ index, isFilled, isAnalyzing, isAIEnabled, reducedMotion }: GridCellProps) {
  const baseClasses = 'w-3 h-3 rounded-sm';

  const getVariant = () => {
    if (reducedMotion) return 'filled'; // Skip animations
    if (isAnalyzing) return 'analyzing';
    if (isFilled) return 'filled';
    return 'visible';
  };

  return (
    <motion.div
      variants={reducedMotion ? undefined : scanGridCellVariants}
      animate={getVariant()}
      className={`${baseClasses} ${
        isFilled
          ? isAIEnabled
            ? 'bg-accent-purple'
            : 'bg-accent-blue'
          : 'bg-surface-3'
      }`}
      style={reducedMotion ? undefined : { transitionDelay: `${index * 20}ms` }}
    >
      {isAIEnabled && isFilled && !reducedMotion && (
        <motion.div
          variants={aiGlowVariants}
          initial="hidden"
          animate={isAnalyzing ? 'pulse' : 'visible'}
          className="w-full h-full rounded-sm"
        />
      )}
    </motion.div>
  );
}

interface ScanGridProps {
  progress: ScanProgressState;
  reducedMotion: boolean;
}

function ScanGrid({ progress, reducedMotion }: ScanGridProps) {
  const { filesDiscovered, totalFiles, analyzedCount, totalFunctions, phase, isAIEnabled } = progress;

  const filledCells = useMemo(() => {
    if (totalFiles === 0) return Math.min(filesDiscovered, TOTAL_CELLS);
    return Math.round((filesDiscovered / Math.max(totalFiles, 1)) * TOTAL_CELLS);
  }, [filesDiscovered, totalFiles]);

  const analyzingCell = useMemo(() => {
    if (phase !== 'analyzing' || totalFunctions === 0) return -1;
    const analysisProgress = analyzedCount / totalFunctions;
    return Math.round(analysisProgress * filledCells);
  }, [phase, analyzedCount, totalFunctions, filledCells]);

  return (
    <motion.div
      variants={reducedMotion ? undefined : scanGridContainerVariants}
      initial={reducedMotion ? undefined : 'hidden'}
      animate={reducedMotion ? undefined : 'visible'}
      className="grid gap-1.5"
      style={{
        gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
      }}
    >
      {Array.from({ length: TOTAL_CELLS }).map((_, index) => (
        <GridCell
          key={index}
          index={index}
          isFilled={index < filledCells}
          isAnalyzing={index === analyzingCell}
          isAIEnabled={isAIEnabled}
          reducedMotion={reducedMotion}
        />
      ))}
    </motion.div>
  );
}

interface ScanStatsProps {
  progress: ScanProgressState;
  reducedMotion: boolean;
}

function ScanStats({ progress, reducedMotion }: ScanStatsProps) {
  const { phase, filesDiscovered, currentFile, analyzedCount, totalFunctions, isAIEnabled } = progress;

  const phaseText = useMemo(() => {
    switch (phase) {
      case 'scanning':
        return 'Scanning project...';
      case 'analyzing':
        return 'Analyzing with AI...';
      case 'complete':
        return 'Scan complete';
      case 'error':
        return 'Scan failed';
      default:
        return 'Preparing...';
    }
  }, [phase]);

  return (
    <div className="space-y-2 text-center">
      <div className="flex items-center justify-center gap-2">
        {(phase === 'scanning' || phase === 'analyzing') && !reducedMotion && (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className={`w-4 h-4 border-2 border-t-transparent rounded-full ${
              isAIEnabled && phase === 'analyzing' ? 'border-accent-purple' : 'border-accent-blue'
            }`}
          />
        )}
        {(phase === 'scanning' || phase === 'analyzing') && reducedMotion && (
          <div className={`w-4 h-4 border-2 border-t-transparent rounded-full ${
            isAIEnabled && phase === 'analyzing' ? 'border-accent-purple' : 'border-accent-blue'
          }`} />
        )}
        <span className="text-sm font-medium">{phaseText}</span>
      </div>

      {currentFile && (
        <p className="text-xs text-text-secondary truncate max-w-md">
          {currentFile}
        </p>
      )}

      <div className="flex items-center justify-center gap-4 text-xs text-text-muted">
        <span>{filesDiscovered} files discovered</span>
        {isAIEnabled && phase === 'analyzing' && (
          <>
            <span>•</span>
            <span>{analyzedCount} / {totalFunctions} analyzed</span>
          </>
        )}
      </div>
    </div>
  );
}

export function ScanProgress({ isVisible }: ScanProgressProps) {
  const scanProgress = useScanStore((state) => state.scanProgress);
  const reducedMotion = useUIStore((state) => state.reducedMotion);
  const { isAIEnabled } = scanProgress;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          variants={reducedMotion ? undefined : scanOverlayVariants}
          initial={reducedMotion ? undefined : 'hidden'}
          animate={reducedMotion ? undefined : 'visible'}
          exit={reducedMotion ? undefined : 'exit'}
          className="fixed inset-0 bg-surface-1/95 backdrop-blur-sm flex items-center justify-center z-50"
        >
          <div className="max-w-lg w-full mx-4 space-y-8">
            {/* Header */}
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-1">
                {isAIEnabled ? 'AI-Powered Scan' : 'Surveyor Scan'}
              </h2>
              <p className="text-sm text-text-secondary">
                {isAIEnabled
                  ? 'Scanning and analyzing your codebase with AI'
                  : 'Scanning your codebase structure'}
              </p>
            </div>

            {/* Grid Visualization */}
            <div className="flex justify-center">
              <div className="p-6 bg-surface-2 rounded-lg border border-surface-3">
                <ScanGrid progress={scanProgress} reducedMotion={reducedMotion} />
              </div>
            </div>

            {/* Stats */}
            <ScanStats progress={scanProgress} reducedMotion={reducedMotion} />

            {/* Status Log */}
            <StatusLog entries={scanProgress.logEntries} maxEntries={4} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
