const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { Server: SocketIOServer } = require('socket.io');

const { setSocketIO } = require('./events');

const authRoutes = require('./routes/auth.routes');
const tasksRoutes = require('./routes/tasks.routes');
const usersRoutes = require('./routes/users.routes');
const campaignsRoutes = require('./routes/campaigns.routes');
const leadsRoutes = require('./routes/leads.routes');
const conversionsRoutes = require('./routes/conversions.routes');
const reportsRoutes = require('./routes/reports.routes');
const packagesRoutes = require('./routes/packages.routes');
const productBannersRoutes = require('./routes/product-banners.routes');
const metaWebhookRoutes = require('./routes/meta-webhook.routes');

const app = express();

const corsOriginHandler = (origin, callback) => {
  callback(null, origin || true);
};

app.use(cors({
  origin: corsOriginHandler,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-email',  'x-user-id', 'x-user-role', 'x-user-name', 'x-role-code', 'x-requested-with']
}));
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  },
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());


const uploadDir1 = path.resolve(__dirname, '../../frontend/public/uploads');
const uploadDir2 = path.resolve(__dirname, '../uploads');
const uploadDir3 = path.resolve('public/uploads');
const uploadDir4 = path.resolve('uploads');
app.use('/uploads', express.static(uploadDir1));
app.use('/uploads', express.static(uploadDir2));
app.use('/uploads', express.static(uploadDir3));
app.use('/uploads', express.static(uploadDir4));


app.use('/uploads', (req, res) => {
  const reqPath = req.path || 'document';
  const fileName = path.basename(reqPath) || 'document';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>MarkOps Document Viewer - ${fileName}</title>
      <style>
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: radial-gradient(circle at center, #1e293b 0%, #0a0f1d 100%);
          color: #f8fafc;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .card {
          background: rgba(30, 41, 59, 0.8);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          padding: 2.25rem 2.5rem;
          max-width: 520px;
          width: 88%;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.65);
          text-align: center;
        }
        .icon-squircle {
          width: 58px;
          height: 58px;
          margin: 0 auto 1.15rem;
          border-radius: 14px;
          background: linear-gradient(135deg, #2563EB 0%, #4F46E5 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          box-shadow: 0 8px 20px rgba(79, 70, 229, 0.38);
        }
        h1 {
          font-size: 1.25rem;
          font-weight: 800;
          color: #FFFFFF;
          margin: 0 0 0.65rem 0;
          letter-spacing: -0.015em;
          word-break: break-all;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          background: rgba(14, 165, 233, 0.15);
          color: #38bdf8;
          border: 1px solid rgba(14, 165, 233, 0.3);
          padding: 0.25rem 0.85rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          margin-bottom: 1.15rem;
        }
        p {
          color: #94a3b8;
          font-size: 0.875rem;
          line-height: 1.6;
          margin: 0 0 1.5rem 0;
        }
        p strong {
          color: #f1f5f9;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
          color: white;
          padding: 0.65rem 1.6rem;
          border-radius: 10px;
          text-decoration: none;
          font-weight: 700;
          font-size: 0.8125rem;
          cursor: pointer;
          border: none;
          box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
          transition: all 0.2s ease;
        }
        .btn:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 6px 20px rgba(79, 70, 229, 0.5);
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon-squircle">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </div>
        <h1>${fileName}</h1>
        <div class="badge">MarkOps Asset Document</div>
        <p>This uploaded document <strong>(${fileName})</strong> is registered and stored in the MarkOps System.</p>
        <button onclick="window.close(); if(!window.closed) history.back();" class="btn">Close / Return to App</button>
      </div>
    </body>
    </html>
  `);
});

const { authenticateJwt } = require('./middleware/auth.middleware');
const { dbPool } = require('./db');

app.use('/api/auth', authRoutes);
app.use('/api/health', (req, res) => res.json({ status: 'UP', timestamp: new Date().toISOString() }));
app.use('/api/v1/meta-webhook', metaWebhookRoutes);


app.use('/api', authenticateJwt(dbPool), tasksRoutes);
app.use('/api', authenticateJwt(dbPool), usersRoutes);
app.use('/api', authenticateJwt(dbPool), campaignsRoutes);
app.use('/api', authenticateJwt(dbPool), leadsRoutes);
app.use('/api', authenticateJwt(dbPool), conversionsRoutes);
app.use('/api', authenticateJwt(dbPool), reportsRoutes);
app.use('/api', authenticateJwt(dbPool), packagesRoutes);
app.use('/api', authenticateJwt(dbPool), productBannersRoutes);


app.use((err, req, res, next) => {
  if (err) {
    console.error('[Server Error Handler]:', err?.message || err);
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON payload format.' });
    }
    return res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
  }
  next();
});

function setupSocketIO(httpServer) {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] },
    transports: ['polling', 'websocket'],
    allowEIO3: true,
  });

  io.on('connection', (socket) => {
    console.log('[Socket.IO] Realtime client connected:', socket.id);
    socket.on('disconnect', () => {
      console.log('[Socket.IO] Realtime client disconnected:', socket.id);
    });
  });

  setSocketIO(io);
  return io;
}

module.exports = {
  app,
  setupSocketIO,
};
