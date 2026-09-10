"use client";

import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Choose a file by clicking or by dropping it on the box. With `sample`, a
 * first-time user can load the bundled example in one click and see the
 * whole flow before preparing their own file; the download link stays for
 * anyone who wants to look at the format first.
 */
export function FilePick({
  id,
  accept,
  fileName,
  onText,
  sample,
  busy,
  prompt,
}: {
  id: string;
  accept: string;
  fileName: string;
  onText: (text: string, name: string) => void | Promise<void>;
  sample?: { url: string; name: string; note?: string; load?: boolean };
  busy?: boolean;
  prompt?: string;
}) {
  const t = useTranslations("form.file");
  const [over, setOver] = useState(false);
  const [loading, setLoading] = useState(false);

  async function take(file: File | undefined) {
    if (!file) return;
    await onText(await file.text(), file.name);
  }

  async function loadSample() {
    if (!sample) return;
    setLoading(true);
    try {
      const res = await fetch(sample.url, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      await onText(await res.text(), sample.name);
    } catch {
      toast.error(t("sampleFailed"));
    } finally {
      setLoading(false);
    }
  }

  const working = Boolean(busy) || loading;
  return (
    <div className="grid gap-2">
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 transition-colors hover:bg-accent",
          over && "border-primary bg-accent",
          fileName && "border-solid"
        )}
      >
        {working ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        ) : fileName ? (
          <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
        ) : (
          <FileUp className="size-5 text-muted-foreground" aria-hidden />
        )}
        <span className="text-sm">{fileName ? t("chosen", { name: fileName }) : (prompt ?? t("drop"))}</span>
        <input id={id} type="file" accept={accept} className="hidden" disabled={working} onChange={(e) => void take(e.target.files?.[0])} />
      </label>
      {sample ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {sample.load !== false ? (
            <Button type="button" variant="outline" size="xs" disabled={working} onClick={() => void loadSample()}>
              {t("trySample")}
            </Button>
          ) : null}
          <span>
            {sample.note ?? t("sampleNote")}{" "}
            <a className="underline" href={sample.url} download>
              {sample.name}
            </a>
          </span>
        </div>
      ) : null}
    </div>
  );
}
