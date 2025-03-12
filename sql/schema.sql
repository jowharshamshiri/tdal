-- Drop tables if they exist (to start fresh)
DROP TABLE IF EXISTS product_view_record;
DROP TABLE IF EXISTS product_shopping_session;
DROP TABLE IF EXISTS user_product_preferences;
DROP TABLE IF EXISTS user_product_data;
DROP TABLE IF EXISTS user_product_bookmark;
DROP TABLE IF EXISTS category_product;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS user_resource_access;
DROP TABLE IF EXISTS payment_transactions;
DROP TABLE IF EXISTS user_credits;
DROP TABLE IF EXISTS credit_packages;
DROP TABLE IF EXISTS users;

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Create schema
-- Core content tables
CREATE TABLE categories (
  category_id INTEGER PRIMARY KEY,
  category_name TEXT NOT NULL,
  description TEXT,
  parent_id INTEGER,
  image_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES categories (category_id)
);

CREATE TABLE products (
  product_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  pricing TEXT NOT NULL,
  hint TEXT,
  teaser TEXT,
  credit_cost INTEGER DEFAULT 0,
  is_free INTEGER NOT NULL DEFAULT 1,
  total_view_count INTEGER DEFAULT 0,
  bookmark_count INTEGER DEFAULT 0,
  avg_view_time REAL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE category_product (
  category_id INTEGER,
  product_id INTEGER,
  PRIMARY KEY (category_id, product_id),
  FOREIGN KEY (category_id) REFERENCES categories (category_id),
  FOREIGN KEY (product_id) REFERENCES products (product_id)
);

-- User tables
CREATE TABLE users (
  user_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', -- 'user', 'admin'
  created_at TEXT NOT NULL,
  updated_at TEXT,
  last_login TEXT
);

-- Credit system tables
CREATE TABLE user_credits (
  credit_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  source TEXT NOT NULL, -- 'purchase', 'signup_bonus', 'admin_grant'
  transaction_id TEXT, -- payment payment id or internal reference
  purchase_date TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (user_id)
);

CREATE TABLE credit_packages (
  package_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  credit_amount INTEGER NOT NULL,
  price REAL NOT NULL, -- in USD
  validity_days INTEGER NOT NULL DEFAULT 365,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE payment_transactions (
  transaction_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  package_id INTEGER,
  amount REAL NOT NULL, -- in USD
  credit_amount INTEGER NOT NULL,
  payment_session_id TEXT,
  payment_payment_intent TEXT,
  status TEXT NOT NULL, -- 'pending', 'completed', 'failed', 'refunded'
  transaction_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (user_id),
  FOREIGN KEY (package_id) REFERENCES credit_packages (package_id)
);

CREATE TABLE user_resource_access (
  access_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  resource_type TEXT NOT NULL, -- 'category', 'product'
  resource_id INTEGER NOT NULL,
  credit_cost INTEGER NOT NULL,
  access_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (user_id)
);

-- New product functionality tables
CREATE TABLE user_product_bookmark (
  bookmark_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users (user_id),
  FOREIGN KEY (product_id) REFERENCES products (product_id)
);

CREATE TABLE user_product_data (
  data_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed TEXT,
  total_view_time INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (user_id) REFERENCES users (user_id),
  FOREIGN KEY (product_id) REFERENCES products (product_id)
);

CREATE TABLE product_shopping_session (
  session_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  category_id INTEGER,
  start_time TEXT NOT NULL,
  last_activity_time TEXT NOT NULL,
  end_time TEXT,
  status TEXT NOT NULL, -- 'active', 'paused', 'completed'
  cards_studied INTEGER NOT NULL DEFAULT 0,
  current_card_index INTEGER NOT NULL DEFAULT 0,
  total_shopping_time INTEGER NOT NULL DEFAULT 0,
  cards_order TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (user_id),
  FOREIGN KEY (category_id) REFERENCES categories (category_id)
);

CREATE TABLE product_view_record (
  record_id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  view_start TEXT NOT NULL,
  view_end TEXT,
  view_time INTEGER,
  page_shown TEXT NOT NULL, -- 'title', 'pricing', 'both'
  hint_viewed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES product_shopping_session (session_id),
  FOREIGN KEY (user_id) REFERENCES users (user_id),
  FOREIGN KEY (product_id) REFERENCES products (product_id)
);

CREATE TABLE user_product_preferences (
  preference_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  default_view TEXT NOT NULL DEFAULT 'all',
  auto_shuffle INTEGER NOT NULL DEFAULT 0,
  show_hints INTEGER NOT NULL DEFAULT 1,
  inactivity_timeout INTEGER NOT NULL DEFAULT 300,
  cards_per_session INTEGER NOT NULL DEFAULT 20,
  FOREIGN KEY (user_id) REFERENCES users (user_id)
);

-- Create indexes for frequently accessed fields
CREATE INDEX idx_categories_parent_id ON categories(parent_id);
CREATE INDEX idx_products_is_free ON products(is_free);
CREATE INDEX idx_category_product_productCategory ON category_product(category_id);
CREATE INDEX idx_category_product_product ON category_product(product_id);
CREATE INDEX idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX idx_user_resource_access_user ON user_resource_access(user_id, resource_type);
CREATE INDEX idx_user_product_bookmark_user ON user_product_bookmark(user_id, product_id, removed);
CREATE INDEX idx_product_shopping_session_user ON product_shopping_session(user_id);
CREATE INDEX idx_product_view_record_session ON product_view_record(session_id);