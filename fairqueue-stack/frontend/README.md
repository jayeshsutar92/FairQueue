# FairQueue Frontend

Next.js UI for the FastAPI stack.

```bash
yarn install
yarn dev
```

Environment variables:

- `NEXT_PUBLIC_API_URL`, default `http://localhost:8000`

Set `NEXT_PUBLIC_API_URL` to `https://fairqueue.onrender.com` for production.

The UI covers signup, password login, OTP login, password reset, queue join,
WebSocket waiting-room updates, seat locking, mock payment confirmation, admin
stats, and admin user deletion.
