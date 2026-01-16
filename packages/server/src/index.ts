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
import { scanRoutes } from './routes/scan.js';

// Load environment variables
config();
config({ path: '../.env' });
config({ path: '../../.env' });

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: (origin) => {
    // Allow all localhost origins for development
    if (!origin || origin.startsWith('http://localhost:')) {
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

// Serve static UI files (production)
app.use('/*', serveStatic({ root: './public' }));

// Start server
const port = parseInt(process.env.SURVEYOR_PORT || '4000', 10);

console.log(`Surveyor server starting on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});

export { app };
