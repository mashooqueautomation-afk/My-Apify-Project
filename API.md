# API Reference

Core endpoints:

- `POST /api/v1/scraping/:campaignId/run`
- `GET /api/v1/scraping/:campaignId/runs/:runId`
- `GET /api/v1/scraping/:campaignId/export`
- `GET /api/v1/api-keys`
- `POST /api/v1/api-keys`
- `GET /api/v1/webhooks`
- `POST /api/v1/webhooks/test`

Authentication:

- JWT: `Authorization: Bearer <token>`
- API key: `Authorization: Bearer mash_live_xxx`
