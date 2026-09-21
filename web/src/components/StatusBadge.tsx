import { Loader2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Status } from "@/lib/types";

const LABELS: Record<Status, string> = {
  pending: "Queued",
  triaging: "Checking",
  accepted: "Accepted",
  denied: "Denied",
  building: "Building",
  testing: "Testing",
  merged: "Live",
  failed: "Failed",
};

const STYLES: Record<Status, string> = {
  pending: "bg-secondary text-secondary-foreground",
  accepted: "bg-secondary text-secondary-foreground",
  triaging: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  building: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  testing: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  merged: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  denied: "bg-destructive/15 text-destructive",
  failed: "bg-destructive/15 text-destructive",
};

export function StatusBadge({ status }: { status: Status }) {
  const busy = status === "triaging" || status === "building" || status === "testing";
  return (
    <Badge className={cn("border-transparent", STYLES[status])}>
      {busy && <Loader2Icon className="animate-spin" data-icon="inline-start" />}
      {LABELS[status]}
    </Badge>
  );
}
