export type LlmCompletionRequest = {
    systemPrompt: string;
    userMessage: string;
};

export type LlmCompletionResult = {
    text: string;
    inputTokens: number;
    outputTokens: number;
};

export abstract class ILlmService {
    abstract complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
}
