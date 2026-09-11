"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, type ComponentProps } from "react";

import { OrgNav } from "@/components/org-nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * The organisation navigation on a narrow screen: the sidebar is hidden
 * below `md`, so a button opens the same `OrgNav` in a sheet from the left.
 * It closes itself when the route changes, so a tap on a link is one tap.
 */
export function MobileNav({ orgName, menuLabel, ...nav }: ComponentProps<typeof OrgNav> & { orgName: string; menuLabel: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Close when the route changes, done as state adjusted during render (the
  // pattern React documents for deriving state from a prop) rather than in
  // an effect.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }
  return (
    <div className="md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button variant="outline" size="sm" aria-label={menuLabel}>
              <Menu className="size-4" aria-hidden />
              {orgName}
            </Button>
          }
        />
        <SheetContent side="left" className="w-72 p-4">
          <SheetHeader className="p-0">
            <SheetTitle>{orgName}</SheetTitle>
            <SheetDescription className="sr-only">{menuLabel}</SheetDescription>
          </SheetHeader>
          <OrgNav {...nav} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
