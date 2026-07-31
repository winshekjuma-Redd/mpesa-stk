# M-Pesa STK Worker

Cloudflare Worker for Safaricom M-Pesa STK Push, using the same public endpoint aliases as `Kcb-stk`.

## Structure

```txt
src/
  config/
  middleware/
  routes/
  services/
  types/
  utils/
  index.ts      # Cloudflare Worker entrypoint
  app.ts        # Legacy Express local entrypoint
```

## Setup

```sh
npm install
```

Create/update `.env` with the same codes/secrets used by the existing local service:

```txt
MPESA_ENVIRONMENT=sandbox
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_BUSINESS_SHORT_CODE=174379
MPESA_TRANSACTION_TYPE=CustomerPayBillOnline
MPESA_PASSKEY=
WORKER_BASE_URL=https://mpesa-stk.your-subdomain.workers.dev
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIRESTORE_TRANSACTIONS_COLLECTION=Transactions
```

Create the Firebase values from a Firebase service account. Keep `FIREBASE_PRIVATE_KEY` on one line with escaped `\n` newlines.

Sync the secret values from `.env` into Cloudflare. At minimum, keep `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` as Cloudflare secrets:

```sh
npx wrangler secret bulk .env
```

Keep non-secret defaults in `wrangler.toml`, especially `MPESA_ENVIRONMENT`, `MPESA_BUSINESS_SHORT_CODE`, `MPESA_TRANSACTION_TYPE`, `WORKER_BASE_URL`, and `FIRESTORE_TRANSACTIONS_COLLECTION`.

## Run With Wrangler

```sh
npm run build
npm run worker:dev
```

## Deploy

```sh
npm run worker:deploy
```

## Endpoints

- `GET /`
- `GET /health`
- `GET /test-auth`
- `POST /`
- `POST /register`
- `POST /kcbmpesa`
- `POST /api/transactions`
- `POST /api/mpesa/stk-push`
- `POST /stk-push`
- `POST /stkpush`
- `POST /monthlycontributions`
- `POST /loans_repayment`
- `POST /fines`
- `POST /sharecapital`
- `POST /wallet`
- `POST /savings`
- `POST /api/mpesa/callback`
- `POST /callback`

Example:

```sh
curl -X POST http://localhost:8787/api/transactions \
  -H "Content-Type: application/json" \
  -d "{\"amount\":1,\"phoneNumber\":\"254713863322\",\"type\":\"DEPOSIT\",\"paymentCategory\":\"savings\",\"internalReference\":\"Test\",\"description\":\"Savings contribution\"}"
```
