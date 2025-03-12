-- Create default credit packages
INSERT INTO credit_packages (name, description, credit_amount, price, validity_days, active)
VALUES 
  ('Starter', 'Perfect for beginners', 20, 4.99, 30, 1),
  ('Standard', 'Most popular option', 100, 19.99, 90, 1),
  ('Premium', 'Best value for serious shoppers', 500, 79.99, 365, 1);

-- Create admin user (password is 'admin' - you should change this in production)
INSERT INTO users (name, email, password, role, created_at)
VALUES ('Admin', 'owner@dogfoodstore.com', '$2b$10$/lfhelurTi19ZtOTn4lAMepUiA/Rplz59MKXMZ6NJzSlOdYv3HJMS', 'admin', datetime('now'));