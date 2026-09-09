import { existsSync, readFileSync } from "node:fs";
import { notFound } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Development only: the magic links that would have been emailed. Absent in
 * production, and absent whenever a real mail server is configured.
 */
export default function DevMail() {
  if (process.env.NODE_ENV === "production" || process.env.EMAIL_SERVER) notFound();
  const lines = existsSync(".devmail.log")
    ? readFileSync(".devmail.log", "utf8").trim().split("\n").filter(Boolean)
    : [];
  const mails = lines
    .map((l) => JSON.parse(l) as { to: string; url: string; at: string })
    .reverse()
    .slice(0, 20);
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Development outbox</CardTitle>
          <CardDescription>
            No EMAIL_SERVER is configured, so sign-in links land here instead of in an inbox.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {mails.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : null}
          {mails.map((m, i) => (
            <div key={i} className="rounded-md border p-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{m.to}</span>
                <span>{new Date(m.at).toLocaleString()}</span>
              </div>
              <a className="mt-1 block break-all font-mono text-xs underline" href={m.url}>
                {m.url}
              </a>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
