# N8N Integration

Use Mash Lead Scrapping with N8N through:

- API keys for campaign execution
- Signed webhooks for completion events
- Export endpoints for Excel, CSV, and JSON files

Recommended pattern:

1. Trigger `POST /api/v1/scraping/:campaignId/run`
2. Poll `GET /api/v1/scraping/:campaignId/runs/:runId`
3. Download `GET /api/v1/scraping/:campaignId/export?format=excel`
