import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { app } from './app.js';

async function startServer() {
  try {
    await connectDatabase();
    const server = app.listen(env.port, () => {
      console.log(`InsightTrack API running on http://localhost:${env.port}`);
    });

    const shutdown = async () => {
      server.close();
      await disconnectDatabase();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();
