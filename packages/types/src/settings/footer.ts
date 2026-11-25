/**
 * Admin-managed storefront footer (SS-900). Every link/URL is validated and
 * rendered as a plain href; no HTML is accepted. Null means "use the
 * storefront's verified built-in defaults", never fabricated content.
 */

export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export interface FooterSettings {
  enabled: boolean;
  blurb: string | null;
  columns: FooterColumn[];
  contact: {
    address: string | null;
    phone: string | null;
    email: string | null;
    hours: string | null;
  };
  socials: FooterLink[];
  legalLinks: FooterLink[];
  copyright: string | null;
}

export interface FooterSettingsResponse {
  value: FooterSettings | null;
  updatedAt: string | null;
  updatedBy: string | null;
  version: number;
}

export interface UpdateFooterSettingsInput {
  value: FooterSettings;
  version: number;
}
