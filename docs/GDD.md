# Gully Mole — Game Design Document

Nov 16, 2026

## Concept

A 2D top-down, real-time web game: Police vs. Chor race to grab one object from the middle of the map and bring it home, while each team secretly carries a spy planted by the other side.

It turns two street games (Chor-Police and capture-the-flag) into an online party game for friends playing from a distance. Name: Gully Mole (may change later).

Design goals:

- **Bring the group together:** built for friends on a call or in a group chat
- **Create debate:** suspicion, accusations and wrong arrests give people something to argue about
- **Ragebait, friendly:** being frozen by your own "teammate", roast awards after the round
- **Never the same twice:** hidden roles change every round, so every game plays out differently
- **Minimal design:** simple shapes, a few colors, one icon per state

## Players and teams

A game needs at least 8 players: two teams of 4. Larger groups add Normal players, and teams of 7 or more get a second spy.

| Players | Per team | Spies per team |
| --- | --- | --- |
| 8 (minimum) | 4: Leader, Detective, Spy, Normal player | 1 |
| 9–12 | 4–6: extra Normal players | 1 |
| 13+ | 7+: extra Normal players | 2 |

The spy counts as a member of the team they sit in, but works for the other team. Roles are assigned randomly by the game at the start of each round and stay fixed: no betrayal, no role swaps.

**Disconnects:** a disconnected player's character stays on the map and can't move. Everyone else plays as usual around them: they can be frozen, and the object can be snatched from them.

## Roles

Each role has one clear job. Only the Leader can unfreeze teammates, which makes the Leader the team's lifeline and the enemy's main target.

| Role | Job | Special powers | Limits |
| --- | --- | --- | --- |
| Leader | Keep the team alive and moving | Fire lamp: only player who can unfreeze teammates. Only player with the minimap and a navigation arrow to the object. Runs faster while carrying the object, if no teammate is frozen. Calls huddles. | Can't call a huddle while frozen |
| Detective | Find and arrest the spy hiding in their team | One pair of handcuffs. Notified whenever a teammate is frozen, to reach the spot first. Reads clues (footprints, frozen hand). Badge visible only to own team. | Wrong arrest = Shame freeze (see Investigation) |
| Normal player | Carry the object, freeze enemies, help the Detective investigate | None | Can't unfreeze anyone |
| Spy | Help their real team win from inside the other team | Secretly freezes fake teammates. Secretly unfreezes players of their real team. Whispers info (like who the Detective is) to their real team. Can silently pass the object to their real team. | Freezing a fake teammate ices their hand. Can never unfreeze fake teammates or carry the object into a base. Seen passing the object = identity revealed. |

Each team knows who its own planted spy is. Only the spy hiding inside a team is a secret to that team.

## Map

One small top-down map, split into two halves, with the object in the middle and limited vision for everyone.

- **Two bases:** Police base on the left, Chor base on the right. Bringing the object to your base wins.
- **Middle zone:** where the object starts.
- **Two fireplaces:** one on each half. The spy melts their frozen hand here; teammates drag a Shame-frozen Detective here.
- **Obstacles:** walls, carts, trees and narrow lanes like real gullies. They block vision and create hiding spots.
- **Limited vision:** each player sees only a small circle around them, and obstacles block it. The server decides what each player can see, so nobody can hack the map to spot the spy.
- **Halves matter:** you can only tag enemies on your own half. Getting frozen on your own half means a spy is nearby.

## The object

The object can be passed between players like a basketball, drops on the spot when its carrier is frozen, and can be snatched by enemies after a short countdown.

- **Dropping:** a frozen carrier drops the object where they stand. It stays there until anyone picks it up.
- **Passing:** only to a teammate standing right beside you, like a quick basketball hand-off. No long throws.
- **Snatching:** an enemy next to the carrier can snatch the object, but only after a short countdown. The carrier can use that time to run or pass it.
- **Navigation:** only the Leader gets an arrow pointing to the object. All players get an arrow to the Leader, but only while the Leader is frozen.
- **Spy:** can't carry the object into a base, but can silently pass it to a player of their real team. If a fake teammate sees the pass, the spy's identity is revealed. Everything the spy does must be done carefully.

## Freezing and unfreezing

Tagged players freeze in place with no countdown; only their Leader's fire lamp (or, for the spy's real team, the spy) can unfreeze them.

- Enemies freeze you by tagging you on their half.
- The spy can secretly freeze fake teammates anywhere.
- The Leader unfreezes teammates with the fire lamp. Normal players and the Detective can't unfreeze.
- The spy can secretly unfreeze players of their real team, only when nobody is watching. Anyone who sees it can raise it in a huddle, and it is a clue for the Detective.
- **Frozen Leader:** the lamp auto-thaws the Leader after about 10 seconds. Teammates get an alert ("Leader frozen, 10s") and a navigation arrow to the Leader, so they can guard them. After thawing, the Leader gets 2–3 seconds of protection from being frozen again.

Three freeze types, told apart by color and one icon:

| Freeze | Look | How to unfreeze |
| --- | --- | --- |
| Tagged by an enemy or the spy | Light blue ice. Both must look identical, or the spy is exposed. | Leader's fire lamp, or the spy (real team only) |
| Shame freeze (Detective's wrong arrest) | Dark red ice, handcuff icon, "1 rescue left" | Teammates drag them to a fireplace, once per round |
| Out (second wrong arrest, or a caught spy) | Grey cracked ice | Can't, until the round ends |

## Spy mechanics

The spy's power comes with a visible cost: every secret freeze of a fake teammate turns the spy's hand to ice for about 20 seconds, unless they melt it sooner at a fireplace.

- **Secret freeze:** the frozen player sees only "Frozen by someone", never a name.
- **Frozen hand:** a small blue glow on the spy's hand, visible only to players close by. It thaws on its own after about 20 seconds.
- **Fireplace:** melts the hand instantly instead of waiting 20 seconds. The spy must get there unseen; smart Detectives watch the fireplaces.
- **Footprints:** each secret freeze leaves footprints for about 20 seconds.
- **Secret unfreeze:** the spy can free players of their real team, never their fake team. Being seen doing it is evidence. The spy can also silently pass the object to their real team, but a fake teammate seeing the pass reveals the spy's identity.
- **Whisper:** a private channel to the spy's real team, used to pass on things like who the Detective is or where the frozen Leader stands.
- **Fake loyalty:** freezing enemies, guarding the object and sounding helpful in huddles.

## Investigation and arrest

There is no voting: the team argues, but only the Detective decides whom to handcuff, and the game reveals the truth instantly.

Clues available:

- A notification to the Detective whenever a teammate is frozen, so they can reach the spot first and see the footprints left by each secret freeze, which last about 20 seconds
- The spy's frozen hand, for about 20 seconds or until melted at a fireplace
- Being frozen on your own half (only a spy can do that)
- Teammates' eyewitness reports, shared in huddles and quick messages

Normal players can't arrest, but they can watch fireplaces, follow suspects and report to the Detective.

The arrest:

1. The Detective physically catches the suspect and uses the handcuffs.
2. **Right person:** the spy is exposed and goes Out (grey ice) for the rest of the round. The game continues; their real team can still win by bringing the object home.
3. **Wrong person:** the Detective is Shame-frozen (dark red ice).
   1. One redemption per round: teammates drag the Detective to a fireplace, slowly and exposed.
   2. A second wrong arrest puts the Detective Out for the round.

## Communication

Players can't type while steering, so talk happens in Leader-called huddles that pause the game, plus one-tap messages during play.

**Huddles**

- Only the Leader can call one, 2 times per round, and not while frozen.
- The whole game and the round timer pause for everyone.
- Each team gets its own chat for 2–3 minutes.
- The spy sits in their fake team's huddle and hears everything.

**One-tap quick messages** (always available, no typing):

- "Spy near the fire!"
- "Leader frozen!"
- "Object on the left!"
- "Trust me bro"

**Spy whisper:** the spy's private line to their real team (see Spy mechanics).

## Round timer and win conditions

A round lasts 10 minutes for 8 players, plus 1 minute for every 2 extra players, up to 15 minutes; huddles pause the clock.

A team wins by any of these, checked in order:

1. **Bring the object home** to their base.
2. **Wipe out:** every opposing player, plus the spy they planted in your team, is frozen or Out at the same time.
3. **Time runs out:** the team with the better automatic stats score wins (see Scoring).

Catching a spy never ends the round by itself. The spy's real team can still bring the object home.

## Scoring

Automatic stats decide which team wins a timed-out round; peer awards from opponents decide each round's individual MVP and never affect the team result.

**Automatic stats** (tracked by the game server; fill in the Weight column once the factor list is final)

| Factor | Earned by | Effect | Weight |
| --- | --- | --- | --- |
| Enemies frozen | Anyone | + | |
| Object snatched from an enemy | Anyone | + | |
| Time holding the object | Team | + | |
| Closest the object got to your base | Team | + | |
| Successful hand-offs to a teammate | Anyone | + | |
| Teammates unfrozen with the fire lamp | Leader | + | |
| Secret freezes never traced back | Spy | + for their real team | |
| Silent passes to the real team | Spy | + for their real team | |
| Secret unfreezes of the real team | Spy | + for their real team | |
| Spy survived the round uncaught | Spy | + for their real team | |
| Correct arrest | Detective | + | |
| Wrong arrest | Detective | − | |
| Own players frozen | Team | − | |
| Object snatched by the enemy | Team | − | |

**The reveal:** after the round, both teams join one chat. Everything is revealed: the spies, the Detectives and key moments.

**Peer awards (Gen-Z roast edition)**

- Every player must hand out at least 3 and at most 5 awards, each to an opponent. Every award gives points, even the roasts.
- **Honesty bonus:** you earn points when your picks match what the stats show, so rating fairly pays.
- Situational awards only appear when the moment happened in that round.
- Roasts stay playful: nothing about looks or anything personal. Groups can add custom awards later.

| Award | Goes to | Set |
| --- | --- | --- |
| Ate and Left No Crumbs | Best player | Default |
| Lowkey Carried | Underrated, quietly useful | Default |
| NPC Energy | Least impact | Default |
| Ice Cold Rizz | Best liar or bluffer | Default |
| Sus Since Minute One | Most suspected, spy or not | Default |
| Delulu Detective | Confident wrong arrest | Settings, situational |
| Fumbled the Bag | Dropped the object right before scoring | Settings, situational |
| Main Character Syndrome | Hogged the object, got frozen anyway | Settings |
| Professional Yapper | Most talk in huddles, least work in game | Settings |
| Caught in 4K | Exposed red-handed | Settings, situational |

## Tech and cost

The game ships as a website only, built and hosted for $0; a solid first version is roughly 5–8 weeks of work.

| Need | Choice | Cost |
| --- | --- | --- |
| Game engine (graphics, movement, joystick) | Phaser | Free, open source |
| Real-time multiplayer server | Colyseus on Node.js | Free, open source |
| Characters, tiles, sounds | Free asset packs (e.g. Kenney) | Free |
| Website hosting | GitHub Pages, Netlify or itch.io | Free |
| Game server hosting | Render free tier | Free; sleeps when idle, so the first game takes about a minute to wake |
| Playing on phones | The website runs in the phone's browser; no mobile app for now | Free |

The server holds all secrets: roles, positions and who can see whom. Phones only get what their player is allowed to see, so nobody can cheat to find the spy.

Costs only appear later: built-in voice at scale, or a stronger server if the game grows.

## Open questions

- [ ] Final game name: Gully Mole for now, may change later
- [ ] Final list of scoring factors, then their weights
- [ ] Length of the snatch countdown

Saved for version upgrades after trial runs: extra clue items such as a CCTV camera, fingerprint kit or lie detector.

## Next steps

1. Play-test the rules for real (a street round with a referee) with 8+ friends.
2. Movement prototype: two players moving on the map in the browser, with a phone joystick.
3. Plain capture-the-object: bases, object, tagging, freezing, Leader's lamp.
4. Add spies, frozen hand, fireplaces, limited vision, Detective and arrests.
5. Add huddles, quick messages, the reveal and awards.
6. Test with 8+ friends on Android and iPhone, then tune.
7. Later: built-in voice controlled by the game.
