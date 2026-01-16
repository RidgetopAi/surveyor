/**
 * Animation variants for Framer Motion
 */

export const nodeVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2 },
  },
  selected: {
    scale: 1.02,
    transition: { duration: 0.15 },
  },
};

export const panelVariants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.25 },
  },
};

export const connectionVariants = {
  normal: { opacity: 0.6, strokeWidth: 1 },
  highlighted: { opacity: 1, strokeWidth: 2 },
  faded: { opacity: 0.15, strokeWidth: 1 },
};
