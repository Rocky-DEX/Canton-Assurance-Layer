"use client";

import { AnchorHistory } from "@/components/anchor-history";

export function HistoryClient({ slug, byDigest }: { slug: string; byDigest: Record<string, string> }) {
  return (
    <AnchorHistory
      url={`/app/${slug}/history/anchors.json`}
      publicationHref={(digest) => (byDigest[digest] ? `/app/${slug}/publications/${byDigest[digest]}` : null)}
    />
  );
}
