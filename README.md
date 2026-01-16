# Landfall

Landfall is a full-stack MTG **Land-only** art A/B voting app. It serves two random land artworks, records votes, and cycles instantly to the next matchup.

## Features

- Land-only art matchups sourced from Scryfall (`type:land`) with server-side Land validation.
- Art crops preferred with safe fallbacks for multi-face cards.
- Postgres-backed storage of card inventory, vote counts, and view counts.
- Optional vote-event logging for future anti-spam analysis.
- Keyboard shortcuts (A = left, B = right).

## Quick start

1. Create a Postgres database and set `DATABASE_URL`.
2. Install dependencies and seed the database:

```bash
npm install
npm run seed
npm start
```

3. Open `http://localhost:3000`.

## Database schema

Run the schema in `db/schema.sql` if you prefer manual setup. The server will also ensure tables exist at startup.

## Seeding and backfill

Use `npm run seed` to populate or update the land catalog. Set `SEED_LIMIT` to control the number of cards fetched (default: 400).

If you want the server to auto-backfill missing cards on `/api/pair`, set `SCRYFALL_BACKFILL=true`. Otherwise, it will only serve cards already stored in Postgres.

## Credits

Landfall is unofficial Fan Content for Magic: The Gathering. © Wizards of the Coast. Card data and images provided by Scryfall. Not endorsed by Wizards or Scryfall.
