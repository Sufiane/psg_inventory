// Backend-internal mirror of the Prisma Roles enum. Kept here so the
// auth guard (and anything else outside src/db) doesn't have to import
// Prisma. Values must stay in sync with the Roles enum in
// src/prisma/schema.prisma.
export const Roles = {
    ADMIN: 'ADMIN',
    USER: 'USER',
} as const;

export type Roles = (typeof Roles)[keyof typeof Roles];
