declare const cacheValue: unique symbol;
declare const cachePattern: unique symbol;

export type CacheKey<T> = string & { readonly [cacheValue]: T };
export type CacheKeyPattern = string & { readonly [cachePattern]: true };
