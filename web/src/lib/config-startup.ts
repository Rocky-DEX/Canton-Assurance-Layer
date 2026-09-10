/**
 * Node-only half of the startup check: prints the report and, in production,
 * exits. Kept out of `instrumentation.ts` because that file is also compiled
 * for the edge runtime, where `process.exit` does not exist.
 */
import { checkConfig } from "./config-check";

export function runStartupCheck(): void {
  const { errors, warnings } = checkConfig(process.env);
  for (const w of warnings) console.warn(`[config] warning: ${w}`);
  if (errors.length === 0) return;
  for (const e of errors) console.error(`[config] error: ${e}`);
  if (process.env.NODE_ENV === "production") {
    console.error(`[config] ${errors.length} error(s); refusing to start. Fix .env and restart.`);
    process.exit(1);
  }
}
