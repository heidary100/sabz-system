export const APP_ROLES = ['CUSTOMER', 'PARTNER', 'OPERATOR', 'ADMIN'] as const;

export type AppRole = (typeof APP_ROLES)[number];
