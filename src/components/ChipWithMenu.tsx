import type { ReactNode } from 'react';
import { useContextTrigger } from './ContextMenu';

interface Props {
  onMenu: (x: number, y: number) => void;
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li';
}

/** Wrapper that supports right-click + long-press without calling hooks in a loop. */
export function ChipWithMenu({ onMenu, children, className, as = 'div' }: Props) {
  const trigger = useContextTrigger(onMenu);
  const Tag = as;
  return (
    <Tag className={className} {...trigger}>
      {children}
    </Tag>
  );
}
