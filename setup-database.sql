-- CPQ Pro Database Setup Script
-- Run this script in MySQL to create the database and user

-- Create the database
CREATE DATABASE IF NOT EXISTS cpq_database1;

-- Use the database
USE cpq_database1;

-- Create quotes table
CREATE TABLE IF NOT EXISTS quotes (
  id VARCHAR(36) PRIMARY KEY,
  client_name VARCHAR(255) NOT NULL,
  client_email VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  configuration JSON,
  selected_tier JSON,
  calculation JSON,
  status ENUM('draft', 'sent', 'viewed', 'accepted', 'rejected') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create pricing_tiers table
CREATE TABLE IF NOT EXISTS pricing_tiers (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  per_user_cost DECIMAL(10,2) NOT NULL,
  per_gb_cost DECIMAL(10,2) NOT NULL,
  managed_migration_cost DECIMAL(10,2) NOT NULL,
  instance_cost DECIMAL(10,2) NOT NULL,
  user_limits JSON,
  gb_limits JSON,
  features JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create hubspot_integrations table
CREATE TABLE IF NOT EXISTS hubspot_integrations (
  id VARCHAR(36) PRIMARY KEY,
  quote_id VARCHAR(36),
  contact_id VARCHAR(255),
  deal_id VARCHAR(255),
  status ENUM('pending', 'success', 'failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
);

-- Create templates table
CREATE TABLE IF NOT EXISTS templates (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  file_name VARCHAR(255) NOT NULL,
  file_type ENUM('pdf', 'docx') NOT NULL,
  file_data LONGBLOB NOT NULL,
  file_size INT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default pricing tiers
INSERT IGNORE INTO pricing_tiers (id, name, per_user_cost, per_gb_cost, managed_migration_cost, instance_cost, user_limits, gb_limits, features) VALUES
('basic', 'Basic', 25.00, 2.50, 500.00, 100.00, '{"from": 1, "to": 50}', '{"from": 10, "to": 500}', '["Basic support", "Standard migration", "Email support", "Basic reporting"]'),
('standard', 'Standard', 45.00, 4.00, 750.00, 200.00, '{"from": 51, "to": 200}', '{"from": 501, "to": 2000}', '["Priority support", "Advanced migration", "Phone & email support", "Advanced reporting", "Custom integrations"]'),
('advanced', 'Advanced', 75.00, 6.50, 1000.00, 350.00, '{"from": 201, "to": 1000}', '{"from": 2001, "to": 10000}', '["Dedicated support", "Premium migration", "24/7 phone support", "Enterprise reporting", "Full customization", "SLA guarantee"]');

-- Show created tables
SHOW TABLES;

-- Show table structures
DESCRIBE quotes;
DESCRIBE pricing_tiers;
DESCRIBE hubspot_integrations;
DESCRIBE templates;

-- Show default pricing tiers
SELECT * FROM pricing_tiers;
