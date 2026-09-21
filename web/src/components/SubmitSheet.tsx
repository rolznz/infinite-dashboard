import { Loader2Icon, SendIcon, WandSparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BuildList } from "@/components/BuildsSheet";
import { CapabilitiesDialog } from "@/components/CapabilitiesDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { EXAMPLES } from "@/lib/format";
import { load, save, visitorId } from "@/lib/storage";
import type { Suggestion, Widget } from "@/lib/types";
import { useIsDesktop } from "@/lib/useMediaQuery";

const DRAFT_KEY = "infinitedash:draft";
const AUTHOR_KEY = "infinitedash:author";

const POWERED_BY = [
  { name: "Cerebras", href: "https://www.cerebras.ai", tagline: "ultra-fast LLM" },
  { name: "Jev by TypeSafe", href: "https://typesafe.ai", tagline: "ultra-fast classifier" },
  { name: "TaskFuel", href: "https://taskfuel.ai", tagline: "2000+ tools for your agent" },
];

export function SubmitSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: string;
  /** Set when forking: the live widget's prompt, which must be changed before submitting. */
  forkOf?: string;
  /** Set when editing one of the visitor's own live widgets: the prompt is a change to it. */
  editOf?: Widget;
  onSubmitted: (s: Suggestion) => void;
  /** The visitor's previous builds, shown under the form. */
  builds: Suggestion[];
  widgets?: Widget[];
  onViewWidget: (widgetId: string) => void;
  onEdit: (widgetId: string) => void;
  onRetry: (prompt: string) => void;
}) {
  const isDesktop = useIsDesktop();
  const editing = props.editOf;
  const [draft, setDraft] = useState(() => load(DRAFT_KEY, ""));
  // An edit gets its own text, so it never clobbers the saved idea draft.
  const [change, setChange] = useState("");
  const [prompt, setPrompt] = editing ? [change, setChange] : [draft, setDraft];
  const [author, setAuthor] = useState(() => load(AUTHOR_KEY, ""));
  const [sending, setSending] = useState(false);
  const [showCapabilities, setShowCapabilities] = useState(false);

  useEffect(() => {
    if (props.open && props.prefill) setDraft(props.prefill);
  }, [props.open, props.prefill]);
  useEffect(() => setChange(""), [editing?.id]);
  // The draft survives reloads until the server has it.
  useEffect(() => save(DRAFT_KEY, draft), [draft]);
  useEffect(() => save(AUTHOR_KEY, author), [author]);

  const trimmed = prompt.trim();
  const norm = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();
  // A fork must change something: the exact same idea is already live (the server rejects it too).
  const unchangedFork = !!props.forkOf && norm(prompt) === norm(props.forkOf);
  const valid = trimmed.length >= (editing ? 3 : 10) && trimmed.length <= 300 && !unchangedFork;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || sending) return;
    setSending(true);
    try {
      const s = await api.submit({
        prompt: trimmed,
        author: author.trim(),
        visitor: visitorId,
        editOf: editing?.id,
      });
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
          {editing ? (
            <>
              <SheetTitle className="text-xl">
                Edit {editing.emoji ?? "✨"} {editing.title}
              </SheetTitle>
              <SheetDescription>
                Describe what to change. The current version stays live until the update is ready.
              </SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle className="text-xl">
                {props.builds.length === 0 ? "Suggest a widget ✨" : "New widget"}
              </SheetTitle>
              <SheetDescription>
                Describe something fun. An AI agent builds it and it goes live for everyone in a few minutes.
              </SheetDescription>
            </>
          )}
        </SheetHeader>
        <form onSubmit={submit} className="flex flex-col gap-4 overflow-y-auto px-4 pb-6">
          <div className="flex flex-col gap-1.5">
            <Textarea
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={300}
              rows={4}
              placeholder={
                editing ? "Make it bigger and add a sound when you click…" : "A button that makes it rain emojis…"
              }
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
          {!editing && (
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              maxLength={40}
              placeholder="Your name or @handle (optional)"
              className="text-base"
            />
          )}
          <Button type="submit" size="lg" disabled={!valid || sending} className="h-11 gap-2">
            {sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            {editing ? "Update it" : "Build it"}
          </Button>
          {!editing && (
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 self-start px-2 text-xs text-muted-foreground"
                onClick={() => setShowCapabilities(true)}
              >
                <WandSparklesIcon /> What can widgets do?
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <div className="font-medium">Powered by</div>
            {POWERED_BY.map((p) => (
              <div key={p.name}>
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                >
                  {p.name}
                </a>{" "}
                · {p.tagline}
              </div>
            ))}
          </div>
          {!editing && props.builds.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-muted-foreground">Your builds</div>
              <BuildList
                builds={props.builds}
                widgets={props.widgets}
                onViewWidget={props.onViewWidget}
                onEdit={props.onEdit}
                onRetry={props.onRetry}
              />
            </div>
          )}
        </form>
        <CapabilitiesDialog
          open={showCapabilities}
          onOpenChange={setShowCapabilities}
          onPick={(example) => {
            setPrompt(example);
            setShowCapabilities(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
