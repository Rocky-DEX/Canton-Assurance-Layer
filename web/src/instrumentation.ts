/**
 * Runs once when the server starts. Checks the configuration and refuses to
 * serve a production deployment that cannot work — no database, no signing
 * service, no way to sign in — so the operator reads one clear message in
 * `docker compose logs web` instead of discovering it at the first click.
 * The check itself lives in a Node-only module; this file is also bundled
 * for the edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartupCheck } = await import("./lib/config-startup");
    runStartupCheck();
  }
}
