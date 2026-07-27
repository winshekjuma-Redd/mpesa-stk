import winston from 'winston';
import { Request, Response, NextFunction } from 'express';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
  ],
});

export const httpLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      type: 'request',
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      country: req.headers['cf-ipcountry'] || 'unknown',
    });
  });
  next();
};
