# I built a tool that shows you what items people actually buy against each hero (and whether it works)

Hiya, I've been playing dota on and off for about a decade and I've always been curious about itemisation — not what the guides tell you to buy, but what people *actually* buy when they see a specific hero on the enemy team, and whether it makes a difference.

So I built a thing: [**Dota 2 Itemisation Stats**](https://dota-items.vercel.app/)

**What it does**

Pick an enemy hero, get a sortable list of every item with two numbers:
- **Buy rate** — how much more often this item is bought against this hero vs the average (1.5x = bought 50% more)
- **Diff** — win rate when the item is bought minus win rate when it isn't

You can also flip it: pick an item and see which enemy heroes it's bought against the most.

**Some things that stood out to me**

- MKB is bought 3x more against PA. Not surprising, but the magnitude is fun to see.
- Silver Edge vs Bristleback: 3.2x buy rate. Break is that important.
- Linken's vs Doom: 2.6x. People really don't want to get Doomed.
- Spirit Vessel vs Necrophos: 1.45x. Reasonable counter but honestly lower than I expected.
- The "counter items" with high buy rates often have *negative* win rate diffs. Classic selection bias — you're more likely to buy Pipe against Zeus when you're already losing to magic damage.

**How it works**

I pulled ~400K ranked matches from the Valve Steam API (the GetMatchHistoryBySequenceNum endpoint — end-game items, no purchase timing). Instead of storing individual matches, everything gets aggregated in-memory into a ~1 MB JSON file. The whole site runs client-side off that static file, no database, no API calls per click. Results are instant.

The stat behind it is team-level marginal win rates: "when anyone on your team has item X at the end of the game and hero Y is on the enemy team." This gives ~130x more data per item-hero pair than hero-specific stats would.

It's open source: [github.com/hlynurd/dota-items](https://github.com/hlynurd/dota-items)

Still in beta and the data only covers recent patches. Would love feedback on what to add — thinking about whether ally-side stats ("what items do teammates buy when X is on your team") would be useful. Let me know what you think.
