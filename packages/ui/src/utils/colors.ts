/**
 * Color utilities
 */

export function getHealthColor(health: 'healthy' | 'warning' | 'critical'): string {
  const colors = {
    healthy: '#4ade80',
    warning: '#facc15',
    critical: '#f87171',
  };
  return colors[health];
}
