/**
 * Startup checks on the console's configuration, so a misconfigured
 * deployment fails at boot with a sentence instead of at the first click
 * with a stack trace. Pure over an environment object; `instrumentation.ts`
 * runs it against `process.env` and decides what to do with the result.
 */

export type ConfigReport = { errors: string[]; warnings: string[] };

type Env = Record<string, string | undefined>;

function isUrl(value: string | undefined, protocols = ["http:", "https:"]): boolean {
  if (!value) return false;
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function checkConfig(env: Env): ConfigReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = env.NODE_ENV === "production";

  if (!env.DATABASE_URL) errors.push("DATABASE_URL is not set (postgresql://user:password@host:5432/db).");
  else if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) errors.push("DATABASE_URL must be a postgresql:// URL.");

  if (!env.AUTH_SECRET) errors.push("AUTH_SECRET is not set. Generate one with: openssl rand -base64 48");
  else if (env.AUTH_SECRET.length < 32) errors.push("AUTH_SECRET is shorter than 32 characters. Generate one with: openssl rand -base64 48");
  else if (production && /change-me|dev-|example|secret/i.test(env.AUTH_SECRET)) errors.push("AUTH_SECRET looks like a placeholder; generate a real one for production.");

  if (!env.AUTH_URL) warnings.push("AUTH_URL is not set; sign-in links will use the request's host. Set it to the public URL of the console (https://...).");
  else if (!isUrl(env.AUTH_URL)) errors.push(`AUTH_URL is not a URL: ${env.AUTH_URL}`);
  else if (production && new URL(env.AUTH_URL).protocol !== "https:" && !/localhost|127\.0\.0\.1/.test(env.AUTH_URL))
    warnings.push("AUTH_URL is http:// in production; sign-in links and session cookies will travel unencrypted unless a proxy adds TLS.");

  if (!env.SERVICE_URL) errors.push("SERVICE_URL is not set (the signing service, e.g. http://service:8790).");
  else if (!isUrl(env.SERVICE_URL)) errors.push(`SERVICE_URL is not a URL: ${env.SERVICE_URL}`);
  if (!env.SERVICE_TOKEN) errors.push("SERVICE_TOKEN is not set; it must equal the signing service's SERVICE_TOKEN.");
  else if (env.SERVICE_TOKEN.length < 32) errors.push("SERVICE_TOKEN is shorter than 32 characters; the signing service refuses it.");

  if (!env.EMAIL_SERVER) {
    if (production && !env.MAGIC_LINK_LOG) {
      errors.push(
        "EMAIL_SERVER is not set, so nobody can sign in. Either set it to an SMTP URL (smtp://user:pass@host:587) or set MAGIC_LINK_LOG=1 to print sign-in links to this container's log."
      );
    } else if (production) {
      warnings.push("EMAIL_SERVER is not set; sign-in links are printed to the container log (MAGIC_LINK_LOG=1). Anyone who can read the log can sign in as anyone.");
    }
  } else if (!isUrl(env.EMAIL_SERVER, ["smtp:", "smtps:"])) {
    errors.push(`EMAIL_SERVER must be an smtp:// or smtps:// URL, got: ${env.EMAIL_SERVER}`);
  }
  if (env.EMAIL_SERVER && !env.EMAIL_FROM) warnings.push("EMAIL_FROM is not set; sign-in mails will have an empty sender.");

  if (env.SIMULATOR_URL && !isUrl(env.SIMULATOR_URL)) errors.push(`SIMULATOR_URL is not a URL: ${env.SIMULATOR_URL}`);
  if (!env.SIMULATOR_URL) warnings.push("SIMULATOR_URL is not set; the Simulator page will say so. Optional.");

  return { errors, warnings };
}
