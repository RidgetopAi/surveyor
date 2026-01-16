/**
 * FilePicker component - Load scan JSON files
 */

import { useRef } from 'react';

interface FilePickerProps {
  onFileSelect: (data: unknown) => void;
  onError: (error: Error) => void;
  className?: string;
  variant?: 'button' | 'dropzone';
}

export function FilePicker({ onFileSelect, onError, className = '', variant = 'button' }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      onFileSelect(data);
    } catch (err) {
      onError(err instanceof Error ? err : new Error('Failed to parse JSON file'));
    }

    // Reset input so same file can be selected again
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      onError(new Error('Please drop a JSON file'));
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      onFileSelect(data);
    } catch (err) {
      onError(err instanceof Error ? err : new Error('Failed to parse JSON file'));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (variant === 'dropzone') {
    return (
      <div
        className={`border-2 border-dashed border-surface-3 rounded-lg p-8 text-center hover:border-accent-blue transition-colors cursor-pointer ${className}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="text-4xl mb-4">📂</div>
        <p className="text-text-primary mb-2">Drop a scan JSON file here</p>
        <p className="text-text-secondary text-sm">or click to browse</p>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        className={`px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/80 text-white rounded text-sm font-medium transition-colors ${className}`}
      >
        Load Scan
      </button>
    </>
  );
}
