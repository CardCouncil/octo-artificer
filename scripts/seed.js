const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const DATABASE_PATH =
  process.env.DATABASE_PATH || path.join(__dirname, '..', 'db', 'landfall.sqlite3');
const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');
const BASE_URL =
  'https://api.scryfall.com/cards/search?q=type%3Aland&unique=art&order=name&include_extras=true';
const SEED_LIMIT_VALUE = Number(process.env.SEED_LIMIT || '5000');
const CARD_LIMIT =
  Number.isFinite(SEED_LIMIT_VALUE) && SEED_LIMIT_VALUE > 0 ? SEED_LIMIT_VALUE : Infinity;
let lastScryfallFetch = 0;

async function initDb() {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  if (!fs.existsSync(SCHEMA_PATH)) {
    throw new Error(`Schema file not found at ${SCHEMA_PATH}`);
  }
  const db = await open({
    filename: DATABASE_PATH,
    driver: sqlite3.Database,
  });
  await db.exec('PRAGMA foreign_keys = ON;');
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await db.exec(schema);
  return db;
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

async function upsertCard(db, card) {
  await db.run(
    `
      INSERT INTO lands (scryfall_id, name, type_line, image_url)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(scryfall_id)
      DO UPDATE SET
        name = excluded.name,
        type_line = excluded.type_line,
        image_url = excluded.image_url;
    `,
    [card.scryfall_id, card.name, card.type_line, card.image_url]
  );
}

async function seed(db) {
  let url = BASE_URL;
  let saved = 0;

  while (url) {
    await rateLimitScryfall();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Scryfall request failed: ${response.status}`);
    }
    const data = await response.json();
    for (const card of data.data) {
      if (!isLandCard(card)) {
        continue;
      }
      const artCrop = getArtCrop(card);
      if (!artCrop) {
        continue;
      }
      await upsertCard(db, {
        scryfall_id: card.id,
        name: card.name,
        type_line: card.type_line,
        image_url: artCrop,
      });
      saved += 1;
      if (saved >= CARD_LIMIT) {
        return saved;
      }
    }
    url = data.has_more ? data.next_page : null;
  }

  return saved;
}

(async () => {
  const db = await initDb();
  try {
    const saved = await seed(db);
    console.log(`Seeded ${saved} land cards.`);
  } catch (error) {
    console.error('Seeding failed', error);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
