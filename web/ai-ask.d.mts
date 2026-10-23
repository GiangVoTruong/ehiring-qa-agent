export const aiOn: () => boolean;
export function ask(system: string, content: { type: string; text?: string; source?: unknown }[], maxTokens?: number, timeoutMs?: number): Promise<string | null>;
