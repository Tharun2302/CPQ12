-- Digital Signature Forms Database Schema
-- This schema supports the complete client approval workflow

-- Signature Forms Table
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

-- Form Interactions Tracking Table
CREATE TABLE IF NOT EXISTS form_interactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  form_id VARCHAR(255) NOT NULL,
  interaction_type VARCHAR(100) NOT NULL,
  interaction_data JSON,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_form_id (form_id),
  INDEX idx_interaction_type (interaction_type),
  INDEX idx_timestamp (timestamp),
  
  FOREIGN KEY (form_id) REFERENCES signature_forms(form_id) ON DELETE CASCADE
);

-- Email Tracking Table
CREATE TABLE IF NOT EXISTS email_tracking (
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
  INDEX idx_sent_at (sent_at),
  
  FOREIGN KEY (form_id) REFERENCES signature_forms(form_id) ON DELETE CASCADE
);

-- Analytics Summary Table
CREATE TABLE IF NOT EXISTS analytics_summary (
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

-- Client Approval History Table
CREATE TABLE IF NOT EXISTS client_approval_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  form_id VARCHAR(255) NOT NULL,
  action_type ENUM('form_opened', 'signature_started', 'signature_completed', 'form_submitted', 'approved', 'rejected') NOT NULL,
  action_data JSON,
  ip_address VARCHAR(45),
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_form_id (form_id),
  INDEX idx_action_type (action_type),
  INDEX idx_timestamp (timestamp),
  
  FOREIGN KEY (form_id) REFERENCES signature_forms(form_id) ON DELETE CASCADE
);

-- Insert sample data for testing
INSERT IGNORE INTO signature_forms (form_id, quote_id, client_email, client_name, quote_data, status, expires_at) VALUES
('form-1703123456789-abc123', 'quote-001', 'john.doe@example.com', 'John Doe', '{"totalCost": 5000, "plan": "Premium"}', 'pending', DATE_ADD(NOW(), INTERVAL 7 DAY)),
('form-1703123456790-def456', 'quote-002', 'jane.smith@example.com', 'Jane Smith', '{"totalCost": 7500, "plan": "Enterprise"}', 'completed', DATE_ADD(NOW(), INTERVAL 7 DAY));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_signature_forms_composite ON signature_forms(status, approval_status, created_at);
CREATE INDEX IF NOT EXISTS idx_form_interactions_composite ON form_interactions(form_id, interaction_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_email_tracking_composite ON email_tracking(form_id, email_type, status);
