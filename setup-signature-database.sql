-- Digital Signature Forms Database Setup Script
-- Run this script to create all necessary tables for the signature system

-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS client_approval_history;
DROP TABLE IF EXISTS analytics_summary;
DROP TABLE IF EXISTS email_tracking;
DROP TABLE IF EXISTS form_interactions;
DROP TABLE IF EXISTS signature_forms;

-- Create Signature Forms Table
CREATE TABLE signature_forms (
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

-- Create Form Interactions Tracking Table
CREATE TABLE form_interactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  form_id VARCHAR(255) NOT NULL,
  interaction_type VARCHAR(100) NOT NULL,
  interaction_data JSON,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_form_id (form_id),
  INDEX idx_interaction_type (interaction_type),
  INDEX idx_timestamp (timestamp)
);

-- Create Email Tracking Table
CREATE TABLE email_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  form_id VARCHAR(255) NOT NULL,
  email_type ENUM('signature_form', 'reminder', 'notification') NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  opened_at TIMESTAMP NULL,
  clicked_at TIMESTAMP NULL,
  status ENUM('sent', 'delivered', 'opened', 'clicked', 'bounced') DEFAULT 'sent',
  
  INDEX idx_form_id (form_id),
  INDEX idx_email_type (email_type),
  INDEX idx_recipient_email (recipient_email),
  INDEX idx_sent_at (sent_at)
);

-- Create Analytics Summary Table
CREATE TABLE analytics_summary (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  total_forms INT DEFAULT 0,
  pending_forms INT DEFAULT 0,
  completed_forms INT DEFAULT 0,
  approved_forms INT DEFAULT 0,
  rejected_forms INT DEFAULT 0,
  avg_completion_time_minutes DECIMAL(10,2) DEFAULT 0,
  total_interactions INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_date (date)
);

-- Create Client Approval History Table
CREATE TABLE client_approval_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  form_id VARCHAR(255) NOT NULL,
  action_type ENUM('form_opened', 'signature_started', 'signature_completed', 'form_submitted', 'approved', 'rejected') NOT NULL,
  action_data JSON,
  ip_address VARCHAR(45),
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_form_id (form_id),
  INDEX idx_action_type (action_type),
  INDEX idx_timestamp (timestamp)
);

-- Create composite indexes for better performance
CREATE INDEX idx_signature_forms_composite ON signature_forms(status, approval_status, created_at);
CREATE INDEX idx_form_interactions_composite ON form_interactions(form_id, interaction_type, timestamp);
CREATE INDEX idx_email_tracking_composite ON email_tracking(form_id, email_type, status);

-- Insert sample data for testing
INSERT INTO signature_forms (form_id, quote_id, client_email, client_name, quote_data, status, expires_at) VALUES
('form-1703123456789-abc123', 'quote-001', 'john.doe@example.com', 'John Doe', '{"totalCost": 5000, "plan": "Premium"}', 'pending', DATE_ADD(NOW(), INTERVAL 7 DAY)),
('form-1703123456790-def456', 'quote-002', 'jane.smith@example.com', 'Jane Smith', '{"totalCost": 7500, "plan": "Enterprise"}', 'completed', DATE_ADD(NOW(), INTERVAL 7 DAY)),
('form-1703123456791-ghi789', 'quote-003', 'bob.wilson@example.com', 'Bob Wilson', '{"totalCost": 3000, "plan": "Basic"}', 'pending', DATE_ADD(NOW(), INTERVAL 7 DAY));

-- Insert sample interactions
INSERT INTO form_interactions (form_id, interaction_type, interaction_data) VALUES
('form-1703123456789-abc123', 'form_opened', '{"timeSpent": 0}'),
('form-1703123456789-abc123', 'quote_reviewed', '{"timeSpent": 45}'),
('form-1703123456790-def456', 'form_opened', '{"timeSpent": 0}'),
('form-1703123456790-def456', 'signature_started', '{"timeSpent": 120}'),
('form-1703123456790-def456', 'signature_completed', '{"timeSpent": 180}'),
('form-1703123456790-def456', 'form_submitted', '{"approvalStatus": "approved", "hasComments": false, "timeSpent": 240}');

-- Insert sample email tracking
INSERT INTO email_tracking (form_id, email_type, recipient_email, subject, status) VALUES
('form-1703123456789-abc123', 'signature_form', 'john.doe@example.com', 'Quote #CPQ-001 - Digital Signature Required', 'sent'),
('form-1703123456790-def456', 'signature_form', 'jane.smith@example.com', 'Quote #CPQ-002 - Digital Signature Required', 'opened'),
('form-1703123456791-ghi789', 'signature_form', 'bob.wilson@example.com', 'Quote #CPQ-003 - Digital Signature Required', 'sent');

-- Insert sample analytics summary
INSERT INTO analytics_summary (date, total_forms, pending_forms, completed_forms, approved_forms, rejected_forms, avg_completion_time_minutes, total_interactions) VALUES
(CURDATE(), 3, 2, 1, 1, 0, 4.0, 6);

-- Show table creation results
SELECT 'Database setup completed successfully!' as status;

-- Show created tables
SHOW TABLES LIKE '%signature%';
SHOW TABLES LIKE '%form%';
SHOW TABLES LIKE '%email%';
SHOW TABLES LIKE '%analytics%';
SHOW TABLES LIKE '%approval%';

-- Show sample data
SELECT 'Sample Signature Forms:' as info;
SELECT form_id, client_name, status, approval_status, created_at FROM signature_forms LIMIT 5;

SELECT 'Sample Interactions:' as info;
SELECT form_id, interaction_type, timestamp FROM form_interactions LIMIT 5;

SELECT 'Sample Analytics:' as info;
SELECT * FROM analytics_summary;
