import express from 'express';
import dotenv from 'dotenv';
import indexRoutes from './routes';

dotenv.config();

const app = express();

app.use(express.json());

// Health check endpoint for ALB/ECS
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use('/', indexRoutes);

export default app;
