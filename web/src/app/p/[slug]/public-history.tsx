"use client";

import { AnchorHistory } from "@/components/anchor-history";

export function PublicHistory({ slug }: { slug: string }) {
  return <AnchorHistory url={`/p/${slug}/anchors.json`} />;
}
