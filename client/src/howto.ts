/**
 * "How to play": a short, swipe-through guide for first-timers (D69).
 *
 * Opens by itself the first time someone visits (remembered in localStorage),
 * and any time from the "How to play" buttons on the home and lobby screens.
 * Numbers come from CONFIG so the guide never goes out of date.
 */
import { CONFIG, MAP } from "@gully/shared";

const SEEN_KEY = "gully.howtoSeen";
const T = CONFIG.timers;

interface Page {
  icon: string;
  title: string;
  /** Short lines. Static text only (may contain <b>), never player input. */
  lines: string[];
}

const PAGES: Page[] = [
  {
    icon: "💰",
    title: "The goal",
    lines: [
      `<b>Blue vs Green.</b> ${MAP.potliStarts.length} potlis (loot bags) wait in the middle.`,
      `You start in the other team's den. <b>Your den</b> (your colour) is on the far side, where they start.`,
      `Carry a potli into <b>your den</b>. It's dropped there and counts for you.`,
      `<b>Get both potlis into your den at the same time to win.</b> Enemies can steal them back out, so guard it!`,
    ],
  },
  {
    icon: "🕹️",
    title: "Controls",
    lines: [
      `<b>Move:</b> drag the joystick on the left (phone), or WASD / arrow keys.`,
      `<b>Big button</b> (Space) does whatever fits right now: Tag, Grab, Snatch or Unfreeze.`,
      `<b>Pass</b> (E) hands your potli to a teammate right beside you.`,
      `<b>Q</b> role button (Detective/spy) · <b>H</b> huddle (Leader) · <b>1–4</b> quick messages.`,
      `You carry <b>one potli at a time</b>, and carriers are a bit slower.`,
    ],
  },
  {
    icon: "🧊",
    title: "Freezing",
    lines: [
      `<b>Tag</b> enemies on <b>your half</b> (where you start) to freeze them. You can also tag them inside your den.`,
      `<b>Your den is your safe zone:</b> nobody can tag you while you're inside it.`,
      `After a tag, wait ${T.tagCooldownSec} s before your next one.`,
      `Frozen players drop the potli. <b>Only your Leader</b> (orange lamp badge) can unfreeze you with their lamp.`,
      `<b>Snatch:</b> stay beside an enemy carrier for ${T.snatchCountdownSec} s to take their potli.`,
    ],
  },
  {
    icon: "🕵️",
    title: "Secret roles",
    lines: [
      `Each team has a <b>spy</b> from the other side, hiding among them. Spies secretly freeze and pass to their real team.`,
      `Each team has a <b>Detective</b>. Watch for iced hands and footprints, then Arrest (Q).`,
      `A wrong arrest freezes the Detective. Choose carefully!`,
      `You only see what your blob can see. Walls block your view.`,
    ],
  },
  {
    icon: "📣",
    title: "Talk, time and awards",
    lines: [
      `Leaders can call a <b>huddle</b> (${CONFIG.huddle.perRound} per round): the game pauses so everyone can chat.`,
      `Use <b>Say…</b> for quick messages to your team.`,
      `If time runs out, the team with the better play stats wins.`,
      `After each round you hand out <b>awards</b> to the other team. Every award is a point, even the roasts!`,
    ],
  },
];

let overlay: HTMLDivElement | null = null;
let page = 0;

function build(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "howto-overlay hidden";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "How to play");
  el.innerHTML = `
    <div class="howto-card">
      <button class="howto-skip" type="button" data-act="close">Skip</button>
      <div class="howto-icon" aria-hidden="true"></div>
      <h2 class="howto-title"></h2>
      <ul class="howto-lines"></ul>
      <div class="howto-dots" aria-hidden="true">${PAGES.map(() => "<span></span>").join("")}</div>
      <div class="row howto-nav">
        <button class="btn ghost small" type="button" data-act="back">Back</button>
        <button class="btn primary small" type="button" data-act="next">Next</button>
      </div>
    </div>`;
  el.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
    if (act === "close" || e.target === el) close();
    if (act === "back") go(page - 1);
    if (act === "next") (page === PAGES.length - 1 ? close() : go(page + 1));
  });
  // Swipe left/right on phones.
  let startX = 0;
  el.addEventListener("touchstart", (e) => (startX = e.touches[0].clientX), { passive: true });
  el.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) go(page + (dx < 0 ? 1 : -1));
  });
  document.body.appendChild(el);
  return el;
}

function go(to: number) {
  if (!overlay) return;
  page = Math.max(0, Math.min(PAGES.length - 1, to));
  const p = PAGES[page];
  overlay.querySelector(".howto-icon")!.textContent = p.icon;
  overlay.querySelector(".howto-title")!.textContent = `${page + 1}/${PAGES.length} · ${p.title}`;
  overlay.querySelector(".howto-lines")!.innerHTML = p.lines.map((l) => `<li>${l}</li>`).join("");
  overlay.querySelectorAll(".howto-dots span").forEach((d, i) => d.classList.toggle("on", i === page));
  (overlay.querySelector('[data-act="back"]') as HTMLButtonElement).disabled = page === 0;
  overlay.querySelector('[data-act="next"]')!.textContent = page === PAGES.length - 1 ? "Let's play!" : "Next";
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") close();
  else if (e.key === "ArrowRight") go(page + 1);
  else if (e.key === "ArrowLeft") go(page - 1);
}

export function openHowTo() {
  overlay ??= build();
  overlay.classList.remove("hidden");
  go(0);
  document.addEventListener("keydown", onKey);
  (overlay.querySelector('[data-act="next"]') as HTMLButtonElement).focus();
}

function close() {
  overlay?.classList.add("hidden");
  document.removeEventListener("keydown", onKey);
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode: they'll just see it again next time */
  }
}

/** Show the guide once, on someone's very first visit. */
export function openHowToIfFirstVisit() {
  let seen: string | null = null;
  try {
    seen = localStorage.getItem(SEEN_KEY);
  } catch {
    /* blocked storage: treat as first visit */
  }
  if (!seen) openHowTo();
}
