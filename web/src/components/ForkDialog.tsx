import { GitForkIcon, HeartIcon, Share2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Widget } from "@/lib/types";

/** Native share sheet where available (mostly mobile), otherwise copy the link. */
async function shareWidget(w: Widget) {
  const url = `${location.origin}/?w=${encodeURIComponent(w.id)}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: `${w.emoji ?? "✨"} ${w.title}`, text: `${w.title} on Infinite Dash`, url });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // the user closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Copied to clipboard");
  } catch {
    toast.error(`Couldn't copy the link: ${url}`);
  }
}

/** Shown after liking a widget: its prompt, and a way to remix it into a new idea. */
export function ForkDialog(props: { widget?: Widget; onOpenChange: (open: boolean) => void; onFork: (prompt: string) => void }) {
  const w = props.widget;
  return (
    <Dialog open={!!w} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeartIcon className="size-4 fill-rose-500 text-rose-500" />
            You liked {w?.emoji ?? "✨"} {w?.title}
          </DialogTitle>
          <DialogDescription>This is the idea it was built from. Fork it to make your own version.</DialogDescription>
        </DialogHeader>
        <blockquote className="rounded-lg border bg-muted/50 px-3 py-2.5 text-sm whitespace-pre-wrap break-words">
          {w?.prompt}
        </blockquote>
        <DialogFooter>
          <Button variant="outline" className="gap-2" onClick={() => w && shareWidget(w)}>
            <Share2Icon />
            Share widget URL
          </Button>
          <Button className="gap-2" onClick={() => w?.prompt && props.onFork(w.prompt)}>
            <GitForkIcon />
            Fork it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
