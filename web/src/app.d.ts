import type { SessionUser } from '$lib/types';

declare global {
    namespace App {
        interface Locals {
            user: SessionUser | null;
        }
        interface PageData {
            user: SessionUser | null;
        }
        interface Platform {
            env?: {
                BACKEND_URL?: string;
            };
        }
    }
}

export {};
