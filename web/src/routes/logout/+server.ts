import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { JWT_COOKIE } from '$lib/api';

export const POST: RequestHandler = ({ cookies }) => {
    cookies.delete(JWT_COOKIE, { path: '/' });

    throw redirect(303, '/login');
};
