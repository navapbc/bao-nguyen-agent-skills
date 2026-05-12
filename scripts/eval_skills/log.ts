function ts(): string {
  return new Date().toISOString();
}

export function log(msg: string): void {
  process.stderr.write(`[skill-eval ${ts()}] ${msg}\n`);
}

export function logError(prefix: string, err: unknown): void {
  if (err instanceof Error) {
    log(`${prefix}: ${err.name}: ${err.message || "(empty message)"}`);
    if (err.stack) process.stderr.write(`${err.stack}\n`);
  } else {
    log(`${prefix}: ${String(err)}`);
  }
}
