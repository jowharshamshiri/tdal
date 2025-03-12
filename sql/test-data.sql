-- Insert test users
INSERT INTO users (user_id, name, email, password, role, created_at, updated_at) 
VALUES (1, 'Pet Store Owner', 'owner@dogfoodstore.com', 'hashed_password', 'admin', 
        datetime('now'), datetime('now'));

INSERT INTO users (user_id, name, email, password, role, created_at, updated_at) 
VALUES (2, 'Dog Lover', 'doggy@example.com', 'hashed_password', 'user', 
        datetime('now'), datetime('now'));

-- Insert test categories
INSERT INTO categories (category_id, category_name, description, parent_id, created_at, updated_at) 
VALUES (1, 'Dog Food', 'Dog food categories', NULL, datetime('now'), datetime('now'));

INSERT INTO categories (category_id, category_name, description, parent_id, created_at, updated_at) 
VALUES (2, 'Dry Food', 'Dry dog food varieties', 1, datetime('now'), datetime('now'));

INSERT INTO categories (category_id, category_name, description, parent_id, created_at, updated_at) 
VALUES (3, 'Wet Food', 'Wet dog food varieties', 1, datetime('now'), datetime('now'));

-- Insert test products
INSERT INTO products (
  product_id, title, pricing, hint, is_free, credit_cost, 
  created_at, updated_at
) 
VALUES (
  1, 'Kibble Crunch', 'Premium dry dog food', 'Balanced nutrition', 1, 0, 
  datetime('now'), datetime('now')
);

INSERT INTO products (
  product_id, title, pricing, hint, is_free, credit_cost, 
  created_at, updated_at
) 
VALUES (
  2, 'Meaty Chunks', 'Hearty wet dog food', 'Real meat chunks', 1, 0, 
  datetime('now'), datetime('now')
);

INSERT INTO products (
  product_id, title, pricing, hint, is_free, credit_cost, 
  created_at, updated_at
) 
VALUES (
  3, 'Gourmet Paws', 'Premium wet dog food', 'Grain-free recipe', 0, 5, 
  datetime('now'), datetime('now')
);

-- Insert category-product relationships
INSERT INTO category_product (category_id, product_id) VALUES (1, 1);
INSERT INTO category_product (category_id, product_id) VALUES (2, 3);
INSERT INTO category_product (category_id, product_id) VALUES (3, 2);

-- Insert credit packages
INSERT INTO credit_packages (
  package_id, name, description, credit_amount, price, validity_days, active, created_at, updated_at
)
VALUES (
  1, 'Puppy Starter', '50 credits for new dog owners', 50, 4.99, 365, 1, datetime('now'), datetime('now')
);

INSERT INTO credit_packages (
  package_id, name, description, credit_amount, price, validity_days, active, created_at, updated_at
)
VALUES (
  2, 'Dog Lover Pack', '200 credits for premium pet food', 200, 14.99, 365, 1, datetime('now'), datetime('now')
);

-- Insert user credits
INSERT INTO user_credits (credit_id, user_id, amount, source, transaction_id, purchase_date, expiry_date)
VALUES (1, 2, 10, 'signup_bonus', NULL, datetime('now'), datetime('now', '+365 days'));

INSERT INTO user_credits (credit_id, user_id, amount, source, transaction_id, purchase_date, expiry_date)
VALUES (2, 2, 50, 'purchase', '1', datetime('now'), datetime('now', '+365 days'));

-- Insert payment transactions
INSERT INTO payment_transactions (
  transaction_id, user_id, package_id, amount, credit_amount, 
  payment_session_id, status, transaction_date, created_at, updated_at
)
VALUES (
  1, 2, 1, 4.99, 50, 'sess_123', 'completed', 
  datetime('now'), datetime('now'), datetime('now')
);

-- Insert resource access
INSERT INTO user_resource_access (
  access_id, user_id, resource_type, resource_id, credit_cost, access_date, created_at
)
VALUES (
  1, 2, 'product', 3, 5, datetime('now'), datetime('now')
);

-- Insert shopping session
INSERT INTO product_shopping_session (
  session_id, user_id, category_id, start_time, last_activity_time,
  status, cards_studied, current_card_index, total_shopping_time, cards_order,
  created_at, updated_at
)
VALUES (
  1, 2, 1, datetime('now'), datetime('now'),
  'active', 0, 0, 0, '[1,2]',
  datetime('now'), datetime('now')
);

-- Insert view record
INSERT INTO product_view_record (
  record_id, session_id, user_id, product_id, view_start,
  page_shown, hint_viewed, created_at
)
VALUES (
  1, 1, 2, 1, datetime('now'),
  'title', 0, datetime('now')
);