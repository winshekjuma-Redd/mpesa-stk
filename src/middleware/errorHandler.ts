import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error({ error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
};
