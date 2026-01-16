/**
 * Search bar component for filtering/highlighting nodes
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useScanStore } from '../../stores/scan-store';

interface SearchBarProps {
  className?: string;
}

/**
 * Search bar for finding and highlighting nodes by name
 */
export function SearchBar({ className = '' }: SearchBarProps) {
  const { searchQuery, setSearchQuery } = useScanStore();
  const [localValue, setLocalValue] = useState(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync local value with store on external changes
  useEffect(() => {
    setLocalValue(searchQuery);
  }, [searchQuery]);

  // Debounce search query updates
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalValue(value);

    // Clear existing timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the store update
    debounceRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 150);
  }, [setSearchQuery]);

  const handleClear = useCallback(() => {
    setLocalValue('');
    setSearchQuery('');
    inputRef.current?.focus();
  }, [setSearchQuery]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClear();
    }
  }, [handleClear]);

  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-muted"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Search nodes..."
        className="w-full h-8 pl-9 pr-8 bg-surface-1 border border-surface-3 rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/50"
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute inset-y-0 right-2 flex items-center text-text-muted hover:text-text-primary transition-colors"
          aria-label="Clear search"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
