export function normalizeRecipientName(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ');
}
