/* eslint-disable no-console -- this file is the sanctioned console sink; callers use Logger instead */

/**
 * Minimal structured logger mirroring NestJS Logger's surface.
 * Workers route stdout/stderr to observability + `wrangler tail`,
 * so the underlying sink is still console.*, but callers never see it.
 */
export class Logger {
    constructor(private readonly context: string) {}

    log(message: string, meta?: Record<string, unknown>): void {
        this.emit('log', message, meta);
    }

    warn(message: string, meta?: Record<string, unknown>): void {
        this.emit('warn', message, meta);
    }

    error(message: string, meta?: Record<string, unknown>): void {
        this.emit('error', message, meta);
    }

    debug(message: string, meta?: Record<string, unknown>): void {
        this.emit('debug', message, meta);
    }

    private emit(
        level: 'log' | 'warn' | 'error' | 'debug',
        message: string,
        meta?: Record<string, unknown>,
    ): void {
        const entry = {
            level,
            context: this.context,
            message,
            ...(meta ?? {}),
            timestamp: new Date().toISOString(),
        };

        // Workers observability ingests stdout/stderr; this is the only sink available.
        const sink =
            level === 'error'
                ? console.error
                : level === 'warn'
                  ? console.warn
                  : console.log;
        sink(JSON.stringify(entry));
    }
}
