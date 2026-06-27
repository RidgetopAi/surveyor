import { describe, it, expect } from 'vitest';
import {
  resolveDetectionConfig,
  DEFAULT_DETECTION_CONFIG,
  DEFAULT_SHARED_IGNORE,
} from './detection-config.js';

describe('resolveDetectionConfig', () => {
  it('returns the product defaults when given no override', () => {
    const cfg = resolveDetectionConfig();
    expect(cfg.mode).toBe('app');
    expect(cfg.knip.enabled).toBe(true);
    expect(cfg.dependencyCruiser.enabled).toBe(true);
    expect(cfg.knip.issueTypes).toEqual(['files', 'exports', 'types']);
    expect(cfg.knip.includeEntryExports).toBe(false);
  });

  it('does not mutate the shared defaults (returns fresh arrays)', () => {
    const cfg = resolveDetectionConfig();
    cfg.knip.issueTypes.push('enumMembers');
    cfg.sharedIgnore.push('x');
    cfg.knip.defaultEntry.push('boom');
    cfg.knip.extraEntry.push('boom');
    cfg.knip.forceEnablePlugins.push('boom');
    expect(DEFAULT_DETECTION_CONFIG.knip.issueTypes).toEqual(['files', 'exports', 'types']);
    expect(DEFAULT_SHARED_IGNORE).not.toContain('x');
    expect(DEFAULT_DETECTION_CONFIG.knip.defaultEntry).not.toContain('boom');
    expect(DEFAULT_DETECTION_CONFIG.knip.extraEntry).not.toContain('boom');
    expect(DEFAULT_DETECTION_CONFIG.knip.forceEnablePlugins).not.toContain('boom');
  });

  it('ships entry/plugin defaults that fix the test + script false positives', () => {
    const cfg = resolveDetectionConfig();
    // knip's index/main defaults are preserved so we can extend, not replace.
    expect(cfg.knip.defaultEntry).toContain('{index,cli,main}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}');
    expect(cfg.knip.defaultEntry).toContain(
      'src/{index,cli,main}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}'
    );
    // one-off scripts (any depth) are entries
    expect(cfg.knip.extraEntry).toContain('**/scripts/**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}');
    // test-runner plugins force-enabled (CRA/react-scripts wires jest indirectly)
    expect(cfg.knip.forceEnablePlugins).toEqual(['jest', 'vitest']);
  });

  it('allows overriding the entry/plugin tunables', () => {
    const cfg = resolveDetectionConfig({
      knip: { extraEntry: ['custom/**'], forceEnablePlugins: ['vitest'] },
    });
    expect(cfg.knip.extraEntry).toEqual(['custom/**']);
    expect(cfg.knip.forceEnablePlugins).toEqual(['vitest']);
    // unrelated knip defaults preserved
    expect(cfg.knip.defaultEntry.length).toBeGreaterThan(0);
    expect(cfg.knip.includeEntryExports).toBe(false);
  });

  it('deep-merges nested engine overrides without dropping siblings', () => {
    const cfg = resolveDetectionConfig({
      knip: { timeoutMs: 5000 },
      dependencyCruiser: { includeTypeOnly: false },
      confidence: { knipFile: 0.42 },
    });
    expect(cfg.knip.timeoutMs).toBe(5000);
    expect(cfg.knip.enabled).toBe(true); // sibling preserved
    expect(cfg.dependencyCruiser.includeTypeOnly).toBe(false);
    expect(cfg.dependencyCruiser.exclude).toBe(DEFAULT_DETECTION_CONFIG.dependencyCruiser.exclude);
    expect(cfg.confidence.knipFile).toBe(0.42);
    expect(cfg.confidence.cycle).toBe(DEFAULT_DETECTION_CONFIG.confidence.cycle); // sibling preserved
  });

  it('library mode strips export/type issue groups (public API is not dead code)', () => {
    const cfg = resolveDetectionConfig({ mode: 'library' });
    expect(cfg.mode).toBe('library');
    expect(cfg.knip.issueTypes).toContain('files');
    expect(cfg.knip.issueTypes).not.toContain('exports');
    expect(cfg.knip.issueTypes).not.toContain('types');
  });

  it('library mode keeps export groups when issueTypes is set explicitly', () => {
    const cfg = resolveDetectionConfig({
      mode: 'library',
      knip: { issueTypes: ['files', 'exports'] },
    });
    expect(cfg.knip.issueTypes).toEqual(['files', 'exports']);
  });

  it('app mode preserves export/type groups', () => {
    const cfg = resolveDetectionConfig({ mode: 'app' });
    expect(cfg.knip.issueTypes).toEqual(['files', 'exports', 'types']);
  });
});
