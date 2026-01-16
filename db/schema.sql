CREATE TABLE IF NOT EXISTS lands (
  scryfall_id uuid PRIMARY KEY,
  name text NOT NULL,
  type_line text NOT NULL,
  image_url text NOT NULL,
  votes integer NOT NULL DEFAULT 0,
  views integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vote_events (
  id bigserial PRIMARY KEY,
  scryfall_id uuid REFERENCES lands(scryfall_id),
  client_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
