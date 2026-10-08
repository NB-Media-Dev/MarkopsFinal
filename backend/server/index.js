const { createServer } = require('node:http');
const { app, setupSocketIO } = require('./app');
const { initDatabase } = require('./db');
const { startMetaInsightsScheduler } = require('./services/meta-insights.service');
const { startMetaWebhookQueueWorker } = require('./routes/meta-webhook.routes');

const httpServer = createServer(app);
setupSocketIO(httpServer);

const port = process.env.PORT || 4000;

initDatabase()
  .then(() => {
    startMetaInsightsScheduler();
    startMetaWebhookQueueWorker();
    httpServer.listen(port, () => {
      console.log(`Node Express server listening on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('[Server Startup Error] Database initialization failed:', error.message);
    process.exitCode = 1;
  });
