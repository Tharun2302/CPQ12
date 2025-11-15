-- Setup tables for 'lama' database
-- Run this after creating the database

USE lama;

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

-- Create signature_forms table
CREATE TABLE IF NOT EXISTS signature_forms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  form_id VARCHAR(255) UNIQUE NOT NULL,
  quote_id VARCHAR(255) NOT NULL,
  client_email VARCHAR(255) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  quote_data JSON,
  status ENUM('pending', 'completed', 'expired') DEFAULT 'pending',
  approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  signature_data JSON,
  client_comments TEXT,
  interactions JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  completed_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_form_id (form_id),
  INDEX idx_quote_id (quote_id),
  INDEX idx_client_email (client_email),
  INDEX idx_status (status),
  INDEX idx_approval_status (approval_status),
  INDEX idx_created_at (created_at)
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

-- Show all tables
SHOW TABLES;

-- Show table structures
DESCRIBE quotes;
DESCRIBE signature_forms;
DESCRIBE templates;
DESCRIBE hubspot_integrations;
DESCRIBE pricing_tiers;

