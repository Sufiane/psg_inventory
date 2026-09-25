import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_DIRNAME = path.dirname(fileURLToPath(import.meta.url));
export const E2E_AUTH_FILE = path.resolve(E2E_DIRNAME, '.auth/user.json');
