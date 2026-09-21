import { Loader2Icon, SendIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { EXAMPLES } from "@/lib/format";
import { load, save, visitorId } from "@/lib/storage";
import type { Suggestion } from "@/lib/types";
import { useIsDesktop } from "@/lib/useMediaQuery";

const DRAFT_KEY = "infinitedash:draft";
const AUTHOR_KEY = "infinitedash:author";

export function SubmitSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: string;
  /** Set when forking: the live widget's prompt, which must be changed before submitting. */
  forkOf?: string;
  onSubmitted: (s: Suggestion) => void;
}) {
  const isDesktop = useIsDesktop();
  const [prompt, setPrompt] = useState(() => load(DRAFT_KEY, ""));
  const [author, setAuthor] = useState(() => load(AUTHOR_KEY, ""));
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (props.open && props.prefill) setPrompt(props.prefill);
  }, [props.open, props.prefill]);
  // The draft survives reloads until the server has it.
  useEffect(() => save(DRAFT_KEY, prompt), [prompt]);
  useEffect(() => save(AUTHOR_KEY, author), [author]);

  const trimmed = prompt.trim();
  const norm = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();
  // A fork must change something: the exact same idea is already live (the server rejects it too).
  const unchangedFork = !!props.forkOf && norm(prompt) === norm(props.forkOf);
  const valid = trimmed.length >= 10 && trimmed.length <= 300 && !unchangedFork;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || sending) return;
    setSending(true);
    try {
      const s = await api.submit({ prompt: trimmed, author: author.trim(), visitor: visitorId });
      setPrompt("");
      props.onSubmitted(s);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={isDesktop ? "w-full sm:max-w-md" : "max-h-[92dvh] rounded-t-2xl"}
      >
        <SheetHeader>
          <SheetTitle className="text-xl">Suggest a widget ✨</SheetTitle>
          <SheetDescription>
            Describe something fun. An AI agent builds it and it goes live for everyone in a few minutes.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="flex flex-col gap-4 overflow-y-auto px-4 pb-6">
          <div className="flex flex-col gap-1.5">
            <Textarea
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={300}
              rows={4}
              placeholder="A button that makes it rain emojis…"
              className="min-h-28 resize-none text-base"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
              }}
            />
            <div className="flex justify-between gap-2 text-xs text-muted-foreground">
              <span>{unchangedFork ? "Forked! Change it a bit to make it your own." : ""}</span>
              <span className="tabular-nums">{trimmed.length}/300</span>
            </div>
          </div>
          <Input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            maxLength={40}
            placeholder="Your name or @handle (optional)"
            className="text-base"
          />
          <Button type="submit" size="lg" disabled={!valid || sending} className="h-11 gap-2">
            {sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            Build it
          </Button>
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-muted-foreground">Need inspiration?</div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.slice(0, 4).map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  className="rounded-full border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
