# FairQueue Frontend

Next.js UI for the FastAPI stack.

```bash
yarn install
yarn dev
```

Environment variables:

- `NEXT_PUBLIC_API_BASE`, default `http://localhost:8000`
- `NEXT_PUBLIC_WS_BASE`, default `ws://localhost:8000`

The UI covers queue join, WebSocket waiting-room updates, seat locking, mock
payment confirmation, and admin stats.
