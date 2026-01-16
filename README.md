# Landfall

Landfall is a full-stack MTG **Land-only** art A/B voting app. It serves two random land artworks, records votes, and cycles instantly to the next matchup.

## Features

- Land-only art matchups sourced from Scryfall (`type:land`) with server-side Land validation.
- Art crops preferred with safe fallbacks for multi-face cards.
- SQLite-backed storage of card inventory, vote counts, and view counts (defaults to `db/landfall.sqlite3`).
- Optional vote-event logging for future anti-spam analysis.
- Keyboard shortcuts (A = left, B = right).

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Seed the SQLite database (set `DATABASE_PATH` to override the default location):

```bash
npm run seed
```

3. Start the app and open `http://localhost:3000`.

```bash
npm start
```

## Database schema

Run the SQLite schema in `db/schema.sql` if you prefer manual setup. The server will also ensure tables exist at startup.

## Seeding and backfill

Use `npm run seed` to populate or update the land catalog. `SEED_LIMIT` (default: 5000) controls how many cards are fetched; `DATABASE_PATH` picks which SQLite file to write.

If you want the server to auto-backfill missing cards on `/api/pair`, set `SCRYFALL_BACKFILL=true`. Otherwise, it will only serve cards already stored in SQLite.

## Credits

Landfall is unofficial Fan Content for Magic: The Gathering. © Wizards of the Coast. Card data and images provided by Scryfall. Not endorsed by Wizards or Scryfall.
