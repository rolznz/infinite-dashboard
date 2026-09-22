import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Plain-language version of what the builder can use (worker/tools.ts + sdk/docs.md). Keep in sync.
const GROUPS = [
  {
    title: "Anything you can see and touch",
    text: "The widget itself: how it looks, moves and reacts when you tap or drag it.",
    items: [
      { emoji: "🎮", title: "Games and toys", text: "Clickers, mini-games, fidget toys, anything you can tap or drag.", example: "A whack-a-mole game that gets faster every round" },
      { emoji: "🧊", title: "Animation and 3D", text: "Smooth animations, particles and 3D scenes you can spin around.", example: "A 3D planet with orbiting moons you can drag to spin" },
    ],
  },
  {
    title: "Made once, while your widget is built",
    text: "Created a single time when you submit your idea, then baked in. Everyone sees and hears the same thing, and it never changes afterwards.",
    items: [
      { emoji: "🎨", title: "AI images", text: "Custom illustrations, characters and backgrounds drawn for your widget.", example: "A cute pixel-art cat that purrs when you pet it" },
      { emoji: "🔊", title: "AI sound effects", text: "Real sounds instead of beeps: boings, laughs, explosions, applause.", example: "A big red button that sets off a dramatic explosion" },
    ],
  },
  {
    title: "Fresh every time someone uses it",
    text: "Fetched or created live, right when someone opens or taps the widget, so it can be different every time.",
    items: [
      { emoji: "🐦", title: "Live tweets", text: "The latest posts about any topic, hashtag, $coin or person on X.", example: "A mood meter for the latest tweets about $BTC" },
      { emoji: "📰", title: "Live news", text: "Fresh headlines about anything from Google News.", example: "A ticker of the latest headlines about space launches" },
      { emoji: "🗣️", title: "AI voices", text: "Widgets that talk: narrators, announcers, whispering fortune tellers.", example: "A fortune teller who whispers your fortune out loud" },
      { emoji: "🤖", title: "AI writing", text: "Text written on the spot: roasts, poems, horoscopes, verdicts.", example: "Roast any X user based on their latest tweets" },
      { emoji: "📡", title: "Live data", text: "Free public data like crypto prices, weather and space facts.", example: "Today's weather in any city as a cute animation" },
      { emoji: "💾", title: "Remembers you", text: "Your score, settings or pet's name are saved in your browser.", example: "A plant that grows a little every day you water it" },
    ],
  },
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
        {GROUPS.map((g) => (
          <section key={g.title} className="flex flex-col gap-3 border-t pt-4 first-of-type:border-t-0 first-of-type:pt-0">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-base font-semibold">{g.title}</h3>
              <p className="text-xs text-muted-foreground">{g.text}</p>
            </div>
            <ul className="flex flex-col gap-3">
              {g.items.map((c) => (
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
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
