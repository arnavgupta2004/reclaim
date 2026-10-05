// Local HTTP server: `npm start` / `npm run dev`.

import { createServer } from 'node:http';
import { createApp } from './app.js';
import { createLogger } from './logger.js';
import { createNodeHandler } from './node-adapter.js';

const app = createApp();
const log = createLogger(app.cfg.logLevel);
const port = Number(process.env.PORT ?? 3000);

createServer(createNodeHandler(app)).listen(port, () => {
  log.info('listening', {
    url: `http://localhost:${port}`,
    default_scenario: app.cfg.defaultScenario,
    auth_enforced: app.cfg.apiToken !== null,
    timeout_ms: app.cfg.timeoutMs,
    strict_format: app.cfg.strictFormat,
  });
  if (!app.cfg.apiToken) log.warn('MOCK_API_TOKEN is not set: Authorization is NOT enforced');
});
