import { Page } from 'playwright';

export class StealthManager {
  /**
   * Apply stealth patches
   */
  static async apply(page: Page): Promise<void> {

    await page.addInitScript(() => {

      const nav: any =
        (globalThis as any).navigator;

      // webdriver removal
      Object.defineProperty(
        nav,
        'webdriver',
        {
          get: () => false,
        }
      );

      // fake plugins
      Object.defineProperty(
        nav,
        'plugins',
        {
          get: () => [
            {
              name: 'Chrome PDF Plugin',
            },
          ],
        }
      );

      // fake languages
      Object.defineProperty(
        nav,
        'languages',
        {
          get: () => ['en-US', 'en'],
        }
      );

      // fake chrome object
      (globalThis as any).chrome = {
        runtime: {},
      };

      // permissions spoof
      if (
        nav.permissions &&
        nav.permissions.query
      ) {

        const originalQuery =
          nav.permissions.query.bind(
            nav.permissions
          );

        nav.permissions.query =
          (parameters: any) => {

            if (
              parameters &&
              parameters.name ===
                'notifications'
            ) {

              return Promise.resolve({
                state: 'granted',
              });
            }

            return originalQuery(
              parameters
            );
          };
      }
    });

    // headers
    await page.setExtraHTTPHeaders({
      'accept-language':
        'en-US,en;q=0.9',
    });
  }
}