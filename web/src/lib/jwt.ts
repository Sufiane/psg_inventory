import type { Email, UserId } from '@psg/shared';
import type { SessionUser } from './types';

export function decodeJwt(token: string): SessionUser | null {
    const parts = token.split('.');

    if (parts.length !== 3) {
        return null;
    }

    try {
        const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
        const decoded = atob(padded);
        const claims = JSON.parse(decoded) as {
            sub?: string;
            email?: string;
            role?: string;
            exp?: number;
        };

        if (!claims.sub || !claims.email) {
            return null;
        }

        const role = claims.role === 'ADMIN' ? 'ADMIN' : 'USER';

        if (claims.exp && claims.exp * 1000 < Date.now()) {
            return null;
        }

        return {
            sub: claims.sub as UserId,
            email: claims.email as Email,
            role,
            exp: claims.exp,
        };
    } catch {
        return null;
    }
}
