declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Override<T, U> = Omit<T, keyof U> & U;
