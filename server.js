const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Set it to a Postgres connection string.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

const SCRYFALL_RANDOM = 'https://api.scryfall.com/cards/random?q=type%3Aland';
const MIN_CARDS = 60;
const TARGET_CARDS = 90;
const ALLOW_SCRYFALL_BACKFILL = process.env.SCRYFALL_BACKFILL === 'true';
let lastScryfallFetch = 0;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lands (
      scryfall_id uuid PRIMARY KEY,
      name text NOT NULL,
      type_line text NOT NULL,
      image_url text NOT NULL,
      votes integer NOT NULL DEFAULT 0,
      views integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vote_events (
      id bigserial PRIMARY KEY,
      scryfall_id uuid REFERENCES lands(scryfall_id),
      client_id text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

function getArtCrop(card) {
  if (card?.image_uris?.art_crop) {
    return card.image_uris.art_crop;
  }
  if (Array.isArray(card?.card_faces)) {
    const faceWithArt = card.card_faces.find((face) => face?.image_uris?.art_crop);
    if (faceWithArt) {
      return faceWithArt.image_uris.art_crop;
    }
  }
  return null;
}

function isLandCard(card) {
  const typeLine = card?.type_line || '';
  if (typeLine.toLowerCase().includes('land')) {
    return true;
  }
  if (Array.isArray(card?.card_faces)) {
    return card.card_faces.some((face) =>
      (face?.type_line || '').toLowerCase().includes('land')
    );
  }
  return false;
}

async function rateLimitScryfall() {
  const now = Date.now();
  const elapsed = now - lastScryfallFetch;
  if (elapsed < 120) {
    await new Promise((resolve) => setTimeout(resolve, 120 - elapsed));
  }
  lastScryfallFetch = Date.now();
}

async function fetchRandomLand() {
  await rateLimitScryfall();
  const response = await fetch(SCRYFALL_RANDOM);
  if (!response.ok) {
    throw new Error(`Scryfall request failed: ${response.status}`);
  }
  const card = await response.json();
  if (!isLandCard(card)) {
    return null;
  }
  const artCrop = getArtCrop(card);
  if (!artCrop) {
    return null;
  }
  return {
    scryfall_id: card.id,
    name: card.name,
    type_line: card.type_line,
    image_url: artCrop,
  };
}

async function saveCard(card) {
  if (!card) return false;
  const result = await pool.query(
    `
      INSERT INTO lands (scryfall_id, name, type_line, image_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (scryfall_id) DO NOTHING;
    `,
    [card.scryfall_id, card.name, card.type_line, card.image_url]
  );
  return result.rowCount > 0;
}

async function ensureInventory() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM lands;');
  const count = rows[0]?.count ?? 0;
  if (count >= MIN_CARDS) {
    return;
  }
  if (!ALLOW_SCRYFALL_BACKFILL) {
    throw new Error(
      `Not enough land cards in the database (${count}). Run \"npm run seed\" to populate it.`
    );
  }
  const toFetch = TARGET_CARDS - count;
  for (let i = 0; i < toFetch; i += 1) {
    try {
      const card = await fetchRandomLand();
      await saveCard(card);
    } catch (error) {
      console.error('Failed to fetch land from Scryfall', error);
      break;
    }
  }
}

async function getRandomPair() {
  await ensureInventory();
  const { rows } = await pool.query(
    `
      SELECT scryfall_id, name, type_line, image_url, votes, views
      FROM lands
      ORDER BY random()
      LIMIT 2;
    `
  );
  if (rows.length < 2) {
    throw new Error('Not enough land cards in the database.');
  }
  return rows;
}

app.get('/api/pair', async (req, res) => {
  try {
    const pair = await getRandomPair();
    const ids = pair.map((card) => card.scryfall_id);
    await pool.query('UPDATE lands SET views = views + 1 WHERE scryfall_id = ANY($1::uuid[])', [ids]);
    res.json({
      cards: pair.map((card) => ({
        id: card.scryfall_id,
        name: card.name,
        type_line: card.type_line,
        image_url: card.image_url,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load land pair.' });
  }
});

app.post('/api/vote', async (req, res) => {
  const { selectedId, otherId, clientId } = req.body || {};
  if (!selectedId || !otherId || selectedId === otherId) {
    return res.status(400).json({ error: 'Invalid vote payload.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const voteResult = await client.query(
      'UPDATE lands SET votes = votes + 1 WHERE scryfall_id = $1 RETURNING scryfall_id;',
      [selectedId]
    );
    if (voteResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Selected card not found.' });
    }
    await client.query(
      'INSERT INTO vote_events (scryfall_id, client_id) VALUES ($1, $2);',
      [selectedId, clientId || null]
    );
    const { rows } = await client.query(
      `
        SELECT scryfall_id, votes, views
        FROM lands
        WHERE scryfall_id = ANY($1::uuid[]);
      `,
      [[selectedId, otherId]]
    );
    await client.query('COMMIT');
    const counts = rows.reduce((acc, row) => {
      acc[row.scryfall_id] = { votes: row.votes, views: row.views };
      return acc;
    }, {});
    return res.json({ counts });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error: 'Failed to record vote.' });
  } finally {
    client.release();
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

ensureTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Landfall listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server', error);
    process.exit(1);
  });
