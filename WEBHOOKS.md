# Webhooks

Headers:

- `X-Mash-Event`
- `X-Mash-Delivery`
- `X-Mash-Timestamp`
- `X-Mash-Signature`

Signature:

- Algorithm: HMAC-SHA256
- Format: `sha256=<hex>`

Retry policy should be handled by the queue worker with exponential backoff.
