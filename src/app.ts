import express, { json, urlencoded } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { httpLogger } from './middleware/logger';
import { ipLimiter } from './middleware/rateLimit';
import { whitelistIpAndGeo } from './middleware/security';
import * as routes from './routes';
import callbackRoute from './routes/callback';

const app = express();

app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || env.ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  methods: ['POST', 'OPTIONS', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'ngrok-skip-browser-warning'],
}));
app.use(httpLogger);
app.use(whitelistIpAndGeo);
app.use(ipLimiter);

app.use(json({ limit: '10mb' }));
app.use(urlencoded({ extended: true }));

app.get('/', routes.info);
app.post('/', routes.root);
app.get('/health', routes.health);
app.get('/test-auth', routes.testAuth);

app.post('/api/transactions', routes.createTransaction);
app.post('/api/mpesa/stk-push', routes.createTransaction);
app.post('/stk-push', routes.createTransaction);
app.post('/stkpush', routes.createTransaction);
app.post('/monthlycontributions', routes.createTransaction);
app.post('/loans_repayment', routes.createTransaction);
app.post('/fines', routes.createTransaction);
app.post('/sharecapital', routes.createTransaction);
app.post('/wallet', routes.createTransaction);
app.post('/savings', routes.createTransaction);

app.post('/api/mpesa/callback', callbackRoute);
app.post('/callback', callbackRoute);
app.get('/callback-test', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Callback endpoint is reachable',
    timestamp: new Date().toISOString(),
  });
});

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`M-Pesa STK server running on port ${env.PORT}`);
});
