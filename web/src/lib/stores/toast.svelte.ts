export type ToastVariant = 'positive' | 'warning' | 'negative';
export type Toast = { id: number; message: string; variant: ToastVariant };

const DEFAULT_DURATION_MS = 6000;

class ToastStore {
    toasts = $state<Toast[]>([]);
    private nextId = 0;

    push(message: string, variant: ToastVariant = 'positive'): void {
        const id = this.nextId++;

        this.toasts.push({ id, message, variant });
        setTimeout(() => this.dismiss(id), DEFAULT_DURATION_MS);
    }

    dismiss(id: number): void {
        this.toasts = this.toasts.filter((toast) => toast.id !== id);
    }
}

export const toastStore = new ToastStore();
