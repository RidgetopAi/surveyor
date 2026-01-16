/**
 * Button component
 */

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export function Button({ children, onClick, variant: _variant = 'primary' }: ButtonProps) {
  return <button onClick={onClick}>{children}</button>;
}
