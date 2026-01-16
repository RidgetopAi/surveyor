/**
 * Icon wrapper component
 */

interface IconProps {
  name: string;
  size?: number;
}

export function Icon({ name, size: _size = 16 }: IconProps) {
  return <span>{name}</span>;
}
