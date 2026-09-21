# Writing an Infinite Dash widget

A widget is one folder: `widgets/<id>/`

```
manifest.json   { "id", "title", "emoji", "prompt", "author", "createdAt" }
widget.js       an ES module with a default export: mount(root, sdk)
assets/*        optional files (images, sounds, JSON) that you made or generated at build time
```

The dashboard loads `widget.js` at runtime with a dynamic `import()`. There is **no build step,
no bundler and no npm**: it must be plain modern JavaScript that runs directly in the browser.

## The box

Every widget gets the **same fixed box**: about **300–480px wide × 320px tall** (full width on
phones). `root` already has that size. Fill it and adapt to the width. The widget must never
scroll or overflow, and must not assume a fixed width.

## Rules

1. **Shadow DOM.** First line of `mount`: `const shadow = root.attachShadow({ mode: "open" })`.
   Put all your markup and a `<style>` inside `shadow`. Never touch `document.body`,
   `document.head` or other widgets.
2. **Theme colours.** Use the dashboard's CSS variables (they pass into the shadow root):
   `var(--background)`, `var(--foreground)`, `var(--card)`, `var(--card-foreground)`,
   `var(--primary)`, `var(--primary-foreground)`, `var(--secondary)`, `var(--muted)`,
   `var(--muted-foreground)`, `var(--accent)`, `var(--border)`, `var(--destructive)`, `var(--radius)`.
   They switch automatically between light and dark mode. Bright accent colours are welcome, but
   check they look good on both a white and a near-black background. For canvas/WebGL, read
   `sdk.theme` and `sdk.onThemeChange`.
3. **Libraries only from a CDN**, pinned to a version, as ES modules:
   `import confetti from "https://esm.sh/canvas-confetti@1.9.3";`
   `import * as THREE from "https://esm.sh/three@0.170.0";`
   (`https://cdn.jsdelivr.net/npm/<pkg>@<version>/+esm` also works.) Prefer no libraries.
4. **Data only from public, CORS-enabled endpoints**, fetched directly from the browser. There is
   no backend and no proxy. Test with curl first (it must return `access-control-allow-origin`),
   e.g. `https://api.coinbase.com/v2/prices/BTC-USD/spot`. Always handle fetch errors gracefully.
5. **Clean up.** If you add timers, intervals, animation frames or window/document listeners,
   return a cleanup function from `mount` that removes them.
6. **Don't crash.** Wrap risky code in try/catch and show a friendly message instead.
7. **Sounds.** WebAudio synthesis only works for basic sound effects and is poor quality. If the
   widget's main focus is sound, use the `create_sound_effect` tool to generate better sounds.
   Start audio only after a user click.
8. Use `sdk.asset("assets/file.ext")` for your own files. Never hard-code paths.
9. **Live tweets.** `sdk.tools.twitterSearch("from:NASA")` resolves to an array of
   `{ id, url, text, author, createdAt, likes, retweets, replies }` (newest first). Show a
   loading state, and catch errors with a friendly message. Don't call it more than once per
   minute; results are cached for 10 minutes anyway. Tweet text is untrusted: set it with
   `textContent`, never `innerHTML`.
10. **AI text.** `sdk.tools.llm({ system, prompt })` resolves to a short plain-text reply. Only call
    it when the visitor asks (e.g. clicks a button), never on load or on a timer. Show a loading
    state, catch errors with a friendly message, and set the reply with `textContent`. Put the
    data it needs into `prompt` (e.g. the text of a few tweets from `twitterSearch`).
11. **Live news.** `sdk.tools.newsSearch("space launch")` resolves to up to 10 Google News articles
    `{ title, url, snippet, source, date, imageUrl }` (`date` is relative, e.g. "3 hours ago").
    Same rules as `twitterSearch`: loading state, catch errors, at most once per minute, `textContent`.
12. **AI voice.** `sdk.tools.speak({ text, voice })` resolves to an MP3 URL: `new Audio(url).play()`.
    Up to 500 characters; tags like `[laugh]`, `[pause]` and `<whisper>text</whisper>` work.
    Voices: `eve` (energetic, default), `ara` (warm), `rex` (confident), `sal` (smooth), `leo`
    (authoritative). Only call it from a click, show a loading state and catch errors.
    Fixed lines that never change (a greeting, a catchphrase) are better as `create_sound_effect`.
13. No `eval`, no `new Function`, no `document.cookie`, no `window.top` / `parent`, no alerts or
    prompts, no popups, no auto-playing sound, and nothing that collects personal data.

## Example 1: a lamp that remembers whether it's on

```js
export default function mount(root, sdk) {
  const shadow = root.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { display: block; height: 100%; }
      .wrap { height: 100%; display: grid; place-items: center; transition: background .3s; }
      .wrap.on { background: radial-gradient(circle, #fde68a88, transparent 70%); }
      button { font-size: 96px; background: none; border: none; cursor: pointer; transition: transform .1s, filter .3s; }
      button:active { transform: scale(0.9); }
      .wrap:not(.on) button { filter: grayscale(1) brightness(0.7); }
    </style>
    <div class="wrap"><button aria-label="Toggle the lamp">💡</button></div>`;
  const wrap = shadow.querySelector(".wrap");
  wrap.classList.toggle("on", sdk.store.get("on", true));
  shadow.querySelector("button").addEventListener("click", () => {
    sdk.store.set("on", wrap.classList.toggle("on"));
  });
}
```

## Example 2: live data with a cleanup function

```js
export default function mount(root, sdk) {
  const shadow = root.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      .wrap { height: 100%; display: grid; place-items: center; text-align: center; color: var(--foreground); }
      .price { font-size: 40px; font-weight: 700; transition: color .3s; }
      .up { color: #16a34a; } .down { color: var(--destructive); }
      .label { color: var(--muted-foreground); font-size: 13px; }
    </style>
    <div class="wrap"><div><div class="label">Bitcoin (USD)</div><div class="price">…</div></div></div>`;
  const el = shadow.querySelector(".price");
  let last;
  async function load() {
    try {
      const r = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot");
      const price = Number((await r.json()).data.amount);
      el.className = "price " + (last === undefined ? "" : price >= last ? "up" : "down");
      el.textContent = "$" + price.toLocaleString(undefined, { maximumFractionDigits: 0 });
      last = price;
    } catch {
      el.textContent = "offline 😴";
    }
  }
  load();
  const t = setInterval(load, 15000);
  return () => clearInterval(t);
}
```
