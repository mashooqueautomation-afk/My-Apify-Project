export interface ExtractedContact {
  emails: string[];
  phones: string[];
  websites: string[];
  socialLinks: string[];
}

export class ContactExtractor {

  /**
   * Extract emails
   */
  static extractEmails(
    html: string
  ): string[] {

    const matches =
      html.match(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g
      ) || [];

    return [...new Set(matches)];
  }

  /**
   * Extract phone numbers
   */
  static extractPhones(
    html: string
  ): string[] {

    const matches =
      html.match(
        /(\+?\d[\d\s\-()]{7,}\d)/g
      ) || [];

    return [...new Set(matches)];
  }

  /**
   * Extract websites
   */
  static extractWebsites(
    html: string
  ): string[] {

    const matches =
      html.match(
        /https?:\/\/[^\s"'<>]+/g
      ) || [];

    return [...new Set(matches)];
  }

  /**
   * Extract social links
   */
  static extractSocialLinks(
    html: string
  ): string[] {

    const links =
      this.extractWebsites(html);

    return links.filter((link) =>
      [
        'facebook.com',
        'linkedin.com',
        'instagram.com',
        'twitter.com',
        'x.com',
      ].some((d) =>
        link.includes(d)
      )
    );
  }

  /**
   * Extract all contacts
   */
  static extract(
    html: string
  ): ExtractedContact {

    return {
      emails:
        this.extractEmails(html),

      phones:
        this.extractPhones(html),

      websites:
        this.extractWebsites(html),

      socialLinks:
        this.extractSocialLinks(html),
    };
  }
}