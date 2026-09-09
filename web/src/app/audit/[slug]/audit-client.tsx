"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { AnchorHistory } from "@/components/anchor-history";
import { PackVerify } from "@/components/pack-verify";

type Pub = { id: string; reportDigest: string; publisherKey: string; snapshotTime: string };

export function AuditClient({ slug, publications }: { slug: string; publications: Pub[] }) {
  const t = useTranslations("audit.pack");
  const [selected, setSelected] = useState(publications[0]?.id ?? "");
  const pub = publications.find((p) => p.id === selected);
  const byDigest = Object.fromEntries(publications.map((p) => [p.reportDigest, p.id]));

  return (
    <div className="grid gap-6">
      <AnchorHistory url={`/app/${slug}/history/anchors.json`} publicationHref={(d) => (byDigest[d] ? `/app/${slug}/publications/${byDigest[d]}` : null)} />
      {publications.length > 0 ? (
        <div className="grid gap-3 rounded-md border p-4">
          <div className="font-medium">{t("title")}</div>
          <p className="text-sm text-muted-foreground">{t("body")}</p>
          <select className="w-fit rounded-md border border-input bg-background px-2 py-1 text-sm" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {publications.map((p) => (
              <option key={p.id} value={p.id}>
                {p.snapshotTime}
              </option>
            ))}
          </select>
          {pub ? <PackVerify key={pub.id} fileUrl={(name) => `/app/${slug}/publications/${pub.id}/files/${encodeURIComponent(name)}`} trustedKeyHex={pub.publisherKey} /> : null}
        </div>
      ) : null}
    </div>
  );
}
