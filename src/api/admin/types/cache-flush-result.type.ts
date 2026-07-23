export type CacheFlushResult = {
    key: 'accounting' | 'sales' | 'season-passes' | 'user-by-email';
    status: 'ok' | 'failed';
    error?: string;
};
