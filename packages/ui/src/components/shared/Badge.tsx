/**
 * Badge component for counts and status
 */

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'warning' | 'error' | 'success';
}

export function Badge({ children, variant: _variant = 'default' }: BadgeProps) {
  return <span>{children}</span>;
}
