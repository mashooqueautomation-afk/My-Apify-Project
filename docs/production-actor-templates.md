# Production Actor Templates

These actor templates live under `packages/worker/src/actors/` and are intended to be copied into actor source or used as the baseline for packaged actors.

## E-commerce scraper

Path: `packages/worker/src/actors/ecommerce-scraper/main.js`

Example input:

```json
{
  "site": "ebay",
  "query": "gaming laptop",
  "maxProducts": 50,
  "maxPages": 3,
  "minDelay": 1500,
  "maxDelay": 3500
}
```

Accepted inputs:

- `site`: `amazon` | `ebay` | `aliexpress` | `generic`
- `query`: search term used to generate a seed URL
- `startUrls`: array of explicit listing URLs
- `maxProducts`, `maxPages`
- `proxyUrl`, `headless`
- `minDelay`, `maxDelay`

Output fields:

- `title`, `price`, `currency`, `rating`, `reviewCount`
- `availability`, `image`, `seller`, `sku`, `url`
- `scrapedAt`, `sourceUrl`, `sourceType`

## News scraper

Path: `packages/worker/src/actors/news-scraper/main.js`

Example input:

```json
{
  "site": "bbc",
  "query": "artificial intelligence",
  "maxArticles": 30,
  "includeArticleBody": true
}
```

Accepted inputs:

- `site`: `bbc` | `cnn` | `hackernews` | `medium` | `generic`
- `query` or `startUrls`
- `maxArticles`, `maxLinksPerSeed`
- `proxyUrl`, `headless`
- `minDelay`, `maxDelay`

Output fields:

- `headline`, `summary`, `link`, `author`
- `publicationDate`, `category`, `bodyPreview`
- `paywallDetected`, `scrapedAt`, `sourceUrl`, `sourceType`

## LinkedIn scraper

Path: `packages/worker/src/actors/linkedin-scraper/main.js`

Example input:

```json
{
  "profileUrls": [
    "https://www.linkedin.com/in/example-profile/"
  ],
  "sessionCookie": "li_at=YOUR_COOKIE",
  "maxPosts": 5,
  "minDelay": 3000,
  "maxDelay": 6000
}
```

Accepted inputs:

- `profileUrls` or `urls`
- `sessionCookie`
- `maxPosts`
- `proxyUrl`, `headless`
- `minDelay`, `maxDelay`

Output fields:

- `name`, `title`, `company`, `location`, `about`
- `connectionsCount`, `followersCount`, `currentCompanyUrl`, `profileUrl`
- `posts[]`, `postCount`, `scrapedAt`, `sourceUrl`, `sourceType`

## Dataset export

Supported export formats:

- `/api/v1/datasets/:id/export?format=json`
- `/api/v1/datasets/:id/export?format=json&includeMeta=true`
- `/api/v1/datasets/:id/export?format=csv`
- `/api/v1/datasets/:id/export?format=jsonl`
- `/api/v1/datasets/:id/export?format=xls`
