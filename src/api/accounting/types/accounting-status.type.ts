// The accounting view exposes three buckets; these are the api-side names.
// Mapped to db SaleStatus values by statusConverter.
export type AccountingStatus = 'realized' | 'pending' | 'unrealized';
