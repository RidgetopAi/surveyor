#!/usr/bin/env node
/**
 * Surveyor API Server
 *
 * Provides REST API for:
 * - Triggering scans
 * - Listing/retrieving scan results
 * - Real-time progress via SSE
 */

import { config } from 'dotenv';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { scanRoutes } from './routes/scan.js';

const execFileAsync = promisify(execFile);

// Load environment variables
config();
config({ path: '../.env' });
config({ path: '../../.env' });

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: (origin) => {
    // Allow localhost and ridgetopai.net origins
    if (!origin ||
        origin.startsWith('http://localhost:') ||
        origin.endsWith('.ridgetopai.net') ||
        origin.includes('ridgetopai.net')) {
      return origin || '*';
    }
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// API routes
app.route('/api/v1/scans', scanRoutes);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Open file in editor (nvim)
// LOCAL_PROJECT_ROOT env var sets default project root for relative paths
app.post('/api/v1/open-file', async (c) => {
  const body = await c.req.json<{
    projectPath?: string;
    filePath: string;
    line?: number;
  }>();

  const { filePath, line } = body;

  // Use provided projectPath, env var, or home directory as fallback
  const projectPath = body.projectPath
    || process.env.LOCAL_PROJECT_ROOT
    || process.env.HOME + '/projects';

  // Build absolute path
  const absolutePath = path.join(projectPath, filePath);

  // Validate file exists
  if (!fs.existsSync(absolutePath)) {
    return c.json({ error: `File not found: ${absolutePath}` }, 404);
  }

  // Get nvim socket path from env or use default
  const nvimSocket = process.env.NVIM_SOCKET || '/tmp/nvimsocket';

  // Check if socket exists
  if (!fs.existsSync(nvimSocket)) {
    return c.json({
      error: `Nvim socket not found at ${nvimSocket}. Start nvim with: nvim --listen ${nvimSocket}`,
    }, 400);
  }

  try {
    // Use :edit command which works more reliably than --remote
    const lineCmd = line ? `:${line}` : '';
    await execFileAsync('nvim', [
      '--server', nvimSocket,
      '--remote-send', `<Esc>:edit ${absolutePath}<CR>${lineCmd}<CR>`,
    ]);

    return c.json({ success: true, file: absolutePath });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to open file: ${error}` }, 500);
  }
});

// Serve static UI files (production)
app.use('/*', serveStatic({ root: './public' }));

// Start server
const port = parseInt(process.env.SURVEYOR_PORT || '4000', 10);

console.log(`Serving on: http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});

export { app };
