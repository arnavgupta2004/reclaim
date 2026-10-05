// Vercel Node.js function. vercel.json rewrites every path here; req.url keeps the original path.

import { createApp } from '../src/app.js';
import { createNodeHandler } from '../src/node-adapter.js';

export default createNodeHandler(createApp());
