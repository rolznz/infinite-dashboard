import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Plain-language version of what the builder can use (worker/tools.ts + sdk/docs.md). Keep in sync.
const CAN = [
  { emoji: "🎮", title: "Games and toys", text: "Clickers, mini-games, fidget toys, anything you can tap or drag.", example: "A whack-a-mole game that gets faster every round" },
  { emoji: "🧊", title: "Animation and 3D", text: "Smooth animations, particles and 3D scenes you can spin around.", example: "A 3D planet with orbiting moons you can drag to spin" },
  { emoji: "🎨", title: "AI images", text: "Custom illustrations, characters and backgrounds drawn for your widget.", example: "A cute pixel-art cat that purrs when you pet it" },
  { emoji: "🔊", title: "AI sound effects", text: "Real sounds instead of beeps: boings, laughs, explosions, applause.", example: "A big red button that sets off a dramatic explosion" },
  { emoji: "🐦", title: "Live tweets", text: "The latest posts about any topic, hashtag, $coin or person on X.", example: "A mood meter for the latest tweets about $BTC" },
  { emoji: "🤖", title: "AI writing", text: "Text written on the spot: roasts, poems, horoscopes, verdicts.", example: "Roast any X user based on their latest tweets" },
  { emoji: "📡", title: "Live data", text: "Free public data like crypto prices, weather and space facts.", example: "Today's weather in any city as a cute animation" },
  { emoji: "💾", title: "Remembers you", text: "Your score, settings or pet's name are saved in your browser.", example: "A plant that grows a little every day you water it" },
];

const CANNOT = [
  "Share things between visitors: everyone gets their own copy, so no global counters, leaderboards or multiplayer.",
  "Log in to other sites or use private accounts and API keys.",
  "Change size: every widget gets the same card.",
];

/** "What can widgets do?" in simple terms. Picking an example fills the idea box. */
export function CapabilitiesDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (example: string) => void }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>What can widgets do? 🪄</DialogTitle>
          <DialogDescription>Mix and match any of these. Tap an example to try it.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {CAN.map((c) => (
            <li key={c.title} className="flex gap-3">
              <span className="text-xl leading-6">{c.emoji}</span>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="text-sm font-medium">{c.title}</div>
                <div className="text-xs text-muted-foreground">{c.text}</div>
                <button
                  type="button"
                  onClick={() => props.onPick(c.example)}
                  className="self-start rounded-full border px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {c.example}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-3">
          <div className="text-xs font-medium">Not possible (yet)</div>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground">
            {CANNOT.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
