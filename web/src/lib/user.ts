export function initialsFromEmail(email: string): string {
    const local = email.split('@')[0];
    const words = local.split(/[._-]/).filter((word) => word.length > 0);

    if (words.length === 0) {
        return '?';
    }

    const initials = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);

    return initials.toUpperCase();
}
