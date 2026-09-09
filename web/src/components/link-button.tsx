import Link from "next/link";
import type { ComponentProps } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Variant = NonNullable<Parameters<typeof buttonVariants>[0]>["variant"];
type Size = NonNullable<Parameters<typeof buttonVariants>[0]>["size"];

/** A link styled as a button. Uses a plain anchor for downloads and external URLs. */
export function LinkButton({
  href,
  variant,
  size,
  className,
  download,
  children,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  download?: boolean | string;
} & Omit<ComponentProps<"a">, "href" | "download">) {
  const cls = cn(buttonVariants({ variant, size }), className);
  if (download !== undefined || /^https?:/.test(href)) {
    return (
      <a href={href} download={download} className={cls} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}
