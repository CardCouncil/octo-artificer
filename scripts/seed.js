const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const SEED_LIMIT = Number(process.env.SEED_LIMIT || 400);

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Set it to a Postgres connection string.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const BASE_URL =
  'https://api.scryfall.com/cards/search?q=type%3Aland&unique=art&order=name&include_extras=true';
let lastScryfallFetch = 0;

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

async function upsertCard(card) {
  await pool.query(
    `
      INSERT INTO lands (scryfall_id, name, type_line, image_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (scryfall_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        type_line = EXCLUDED.type_line,
        image_url = EXCLUDED.image_url;
    `,
    [card.scryfall_id, card.name, card.type_line, card.image_url]
  );
}

async function seed() {
  let url = BASE_URL;
  let saved = 0;

  while (url && saved < SEED_LIMIT) {
    await rateLimitScryfall();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Scryfall request failed: ${response.status}`);
    }
    const data = await response.json();
    for (const card of data.data) {
      if (saved >= SEED_LIMIT) {
        break;
      }
      if (!isLandCard(card)) {
        continue;
      }
      const artCrop = getArtCrop(card);
      if (!artCrop) {
        continue;
      }
      await upsertCard({
        scryfall_id: card.id,
        name: card.name,
        type_line: card.type_line,
        image_url: artCrop,
      });
      saved += 1;
    }
    url = data.has_more ? data.next_page : null;
  }

  return saved;
}

seed()
  .then(async (saved) => {
    console.log(`Seeded ${saved} land cards.`);
    await pool.end();
  })
  .catch(async (error) => {
    console.error('Seeding failed', error);
    await pool.end();
    process.exit(1);
  });
