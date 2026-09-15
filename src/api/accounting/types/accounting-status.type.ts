// The accounting view exposes four buckets; these are the api-side names.
// `gifted` is a SUBSET of `unrealized`, not a peer total — every consumer that
// renders both must say so. Mapped to db SaleStatus values by statusConverter.
export type AccountingStatus = 'realized' | 'pending' | 'unrealized' | 'gifted';

// --- Not accounting vocabulary — do not read the two types above and below
// as siblings just because they're both unions of string literals in this
// file. `RawSaleStatus` is Prisma's `SaleStatus` enum, spelled out as plain
// literals so the api layer (which never imports Prisma) can still pass the
// exact strings the db expects. It stays uppercase because it has to match
// those enum members verbatim — lowercasing it would mean adding a
// translation step with no benefit, since this type was never meant to read
// as a display name.
export type RawSaleStatus = 'PENDING' | 'SOLD' | 'CANCELLED' | 'GIFTED';
