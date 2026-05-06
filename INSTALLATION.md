# Mash Lead Scrapping Installation

1. Copy `.env.example` to `.env`.
2. Start local infrastructure with `npm run docker:up:dev`.
3. Run migrations with `npm run db:migrate`.
4. Start local services with `npm run dev`.
5. If old Compose v1 containers exist, run `npm run docker:down:dev` once and then start infra again.

Default app URLs:

- Dashboard: `http://localhost:3001`
- API: `http://localhost:3000`
- MinIO: `http://localhost:9001`
