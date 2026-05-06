export type StoreAppCategory =
  | 'lead-generation'
  | 'ecommerce'
  | 'maps-local'
  | 'news-content'
  | 'web-crawling';

export interface StoreAppDefinition {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: StoreAppCategory;
  runtime: 'node18' | 'playwright' | 'python310' | 'custom';
  icon: string;
  rating: number;
  installs: number;
  featured?: boolean;
  sourcePath: string;
  tags: string[];
  targets: string[];
  useCases: string[];
  defaultInput: Record<string, unknown>;
  defaultRunOptions: {
    memoryMbytes: number;
    timeoutSecs: number;
  };
}

export const STORE_APPS: StoreAppDefinition[] = [
  {
    slug: 'linkedin-lead-scraper',
    name: 'LinkedIn Lead Scraper',
    tagline: 'Extract public profile signals, company data, and recent activity.',
    description: 'Designed for sales prospecting and recruiter workflows. Supports profile lists, recent posts, and structured profile normalization for lead pipelines.',
    category: 'lead-generation',
    runtime: 'playwright',
    icon: 'BriefcaseBusiness',
    rating: 4.7,
    installs: 1280,
    featured: true,
    sourcePath: 'linkedin-scraper/main.js',
    tags: ['linkedin', 'lead-gen', 'profiles', 'recruiting'],
    targets: ['LinkedIn'],
    useCases: ['B2B prospecting', 'Recruitment sourcing', 'Founder research'],
    defaultInput: {
      profileUrls: ['https://www.linkedin.com/in/example-profile/'],
      sessionCookie: 'li_at=YOUR_LINKEDIN_COOKIE',
      maxPosts: 5,
      minDelay: 3000,
      maxDelay: 6000,
    },
    defaultRunOptions: { memoryMbytes: 1024, timeoutSecs: 3600 },
  },
  {
    slug: 'ecommerce-price-monitor',
    name: 'E-Commerce Price Monitor',
    tagline: 'Track products, pricing, ratings, and seller signals across marketplaces.',
    description: 'Supports Amazon, eBay, AliExpress, and generic commerce pages with normalized product output for competitive intelligence and assortment monitoring.',
    category: 'ecommerce',
    runtime: 'playwright',
    icon: 'ShoppingCart',
    rating: 4.8,
    installs: 2140,
    featured: true,
    sourcePath: 'ecommerce-scraper/main.js',
    tags: ['amazon', 'ebay', 'pricing', 'products'],
    targets: ['Amazon', 'eBay', 'AliExpress', 'Generic commerce sites'],
    useCases: ['Price monitoring', 'Catalog intelligence', 'Dropshipping research'],
    defaultInput: {
      site: 'ebay',
      query: 'gaming laptop',
      maxProducts: 50,
      maxPages: 3,
      minDelay: 1500,
      maxDelay: 3500,
    },
    defaultRunOptions: { memoryMbytes: 1024, timeoutSecs: 3600 },
  },
  {
    slug: 'google-maps-business-finder',
    name: 'Google Maps Business Finder',
    tagline: 'Collect local business listings, contacts, categories, and ratings.',
    description: 'Targets local lead generation workflows by searching Google Maps for businesses in a niche and location, then extracting enriched detail panels.',
    category: 'maps-local',
    runtime: 'playwright',
    icon: 'MapPinned',
    rating: 4.6,
    installs: 930,
    featured: true,
    sourcePath: 'google-maps-scraper/main.js',
    tags: ['google-maps', 'local-business', 'leads', 'geo'],
    targets: ['Google Maps'],
    useCases: ['SMB lead generation', 'Agency prospecting', 'Local directory enrichment'],
    defaultInput: {
      query: 'dentists',
      location: 'New York, NY',
      maxResults: 20,
      language: 'en',
      scrapeDetails: true,
    },
    defaultRunOptions: { memoryMbytes: 1024, timeoutSecs: 3600 },
  },
  {
    slug: 'news-monitor',
    name: 'News Monitor',
    tagline: 'Aggregate headlines, summaries, links, and publication metadata.',
    description: 'Useful for media intelligence, trend research, and content feeds. Supports BBC, CNN, Hacker News, Medium, and generic article pages.',
    category: 'news-content',
    runtime: 'playwright',
    icon: 'Newspaper',
    rating: 4.5,
    installs: 860,
    sourcePath: 'news-scraper/main.js',
    tags: ['news', 'monitoring', 'content', 'alerts'],
    targets: ['BBC', 'CNN', 'Hacker News', 'Medium'],
    useCases: ['Trend monitoring', 'Editorial sourcing', 'Competitive intel'],
    defaultInput: {
      site: 'bbc',
      query: 'artificial intelligence',
      maxArticles: 30,
      includeArticleBody: true,
    },
    defaultRunOptions: { memoryMbytes: 768, timeoutSecs: 2400 },
  },
  {
    slug: 'generic-web-crawler',
    name: 'Generic Web Crawler',
    tagline: 'Crawl generic sites and structured pages when no niche app exists yet.',
    description: 'A fallback crawler for custom discovery and structured extraction. Useful when you need to bootstrap a new scraper before packaging it as a dedicated store app.',
    category: 'web-crawling',
    runtime: 'playwright',
    icon: 'Globe',
    rating: 4.3,
    installs: 640,
    sourcePath: 'web-crawler/main.js',
    tags: ['crawler', 'generic', 'discovery', 'custom'],
    targets: ['Generic websites'],
    useCases: ['Exploration', 'Discovery crawling', 'Prototype scrapers'],
    defaultInput: {
      startUrls: ['https://example.com'],
      maxPages: 25,
      sameDomainOnly: true,
    },
    defaultRunOptions: { memoryMbytes: 768, timeoutSecs: 2400 },
  },
];

export function getStoreApp(slug: string) {
  return STORE_APPS.find((app) => app.slug === slug);
}
