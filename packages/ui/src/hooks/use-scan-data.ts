/**
 * Hook for loading scan data from JSON files
 */

import { useState, useCallback } from 'react';
import type { ScanResult } from '@surveyor/core';

export interface UseScanDataState {
  data: ScanResult | null;
  isLoading: boolean;
  error: Error | null;
}

export interface UseScanDataReturn extends UseScanDataState {
  loadFromUrl: (url: string) => Promise<void>;
  loadFromFile: (file: File) => Promise<void>;
  clear: () => void;
}

/**
 * Hook to load and manage scan data
 * Supports loading from URL (fetch) or File object (FileReader)
 */
export function useScanData(): UseScanDataReturn {
  const [state, setState] = useState<UseScanDataState>({
    data: null,
    isLoading: false,
    error: null,
  });

  const loadFromUrl = useCallback(async (url: string) => {
    setState({ data: null, isLoading: true, error: null });

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      validateScanResult(json);

      setState({ data: json as ScanResult, isLoading: false, error: null });
    } catch (err) {
      setState({
        data: null,
        isLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }, []);

  const loadFromFile = useCallback(async (file: File) => {
    setState({ data: null, isLoading: true, error: null });

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      validateScanResult(json);

      setState({ data: json as ScanResult, isLoading: false, error: null });
    } catch (err) {
      setState({
        data: null,
        isLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }, []);

  const clear = useCallback(() => {
    setState({ data: null, isLoading: false, error: null });
  }, []);

  return {
    ...state,
    loadFromUrl,
    loadFromFile,
    clear,
  };
}

/**
 * Validates that an object matches the ScanResult schema
 * Throws if validation fails
 */
function validateScanResult(obj: unknown): asserts obj is ScanResult {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Invalid scan result: not an object');
  }

  const scan = obj as Record<string, unknown>;

  // Check required fields
  const requiredFields = [
    'id',
    'projectPath',
    'projectName',
    'status',
    'createdAt',
    'stats',
    'nodes',
    'connections',
    'warnings',
    'clusters',
    'errors',
  ];

  for (const field of requiredFields) {
    if (!(field in scan)) {
      throw new Error(`Invalid scan result: missing field "${field}"`);
    }
  }

  // Check stats structure
  if (!scan.stats || typeof scan.stats !== 'object') {
    throw new Error('Invalid scan result: stats must be an object');
  }

  // Check nodes is a record
  if (!scan.nodes || typeof scan.nodes !== 'object') {
    throw new Error('Invalid scan result: nodes must be an object');
  }

  // Check arrays
  if (!Array.isArray(scan.connections)) {
    throw new Error('Invalid scan result: connections must be an array');
  }
  if (!Array.isArray(scan.warnings)) {
    throw new Error('Invalid scan result: warnings must be an array');
  }
  if (!Array.isArray(scan.clusters)) {
    throw new Error('Invalid scan result: clusters must be an array');
  }
  if (!Array.isArray(scan.errors)) {
    throw new Error('Invalid scan result: errors must be an array');
  }
}
