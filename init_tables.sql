CREATE TABLE IF NOT EXISTS user_accounts (
  user_id     SERIAL PRIMARY KEY,
  name        TEXT,
  email       TEXT,
  phone       INTEGER,
  age         INTEGER,
  password    TEXT,
  superuser   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  order_id    SERIAL PRIMARY KEY,
  user_id     INTEGER,
  car_id      INTEGER,
  start_date  DATE,
  end_date    DATE,
  rental_cost FLOAT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cars (
  car_id        SERIAL PRIMARY KEY,
  brand_id      INTEGER,
  category_id   INTEGER,
  rental_price  FLOAT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brands (
  brand_id      SERIAL PRIMARY KEY,
  brand_name    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  category_id   SERIAL PRIMARY KEY,
  category_name TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);