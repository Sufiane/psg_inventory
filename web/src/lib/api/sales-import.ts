import type {
    CommitResult,
    DraftRow,
    PreviewResponse,
    RevertResult,
} from '$lib/types/sales-import';

export async function previewImport(
    file: File,
    selectedPassIds: string[],
): Promise<PreviewResponse> {
    const formData = new FormData();

    formData.append('file', file);
    formData.append('selectedPassIds', JSON.stringify(selectedPassIds));

    const response = await fetch('/api/sales-import/preview', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error(await extractMessage(response));
    }

    return (await response.json()) as PreviewResponse;
}

export async function commitImport(
    selectedPassIds: string[],
    rows: DraftRow[],
): Promise<CommitResult> {
    const response = await fetch('/api/sales-import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedPassIds, rows }),
    });

    if (!response.ok) {
        throw new Error(await extractMessage(response));
    }

    return (await response.json()) as CommitResult;
}

export async function revertImport(batchId: string): Promise<RevertResult> {
    const response = await fetch(`/api/sales-import/${batchId}`, { method: 'DELETE' });

    if (!response.ok) {
        throw new Error(await extractMessage(response));
    }

    return (await response.json()) as RevertResult;
}

async function extractMessage(response: Response): Promise<string> {
    try {
        const body = (await response.json()) as { message?: string };

        if (typeof body.message === 'string') {
            return body.message;
        }
    } catch {
        // fall through
    }

    return `Request failed (${response.status})`;
}
