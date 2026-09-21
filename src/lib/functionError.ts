export async function getFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (!context?.json) return fallback;

  try {
    const body = await context.json() as { error?: unknown };
    return typeof body.error === 'string' && body.error.trim() ? body.error : fallback;
  } catch {
    return fallback;
  }
}
