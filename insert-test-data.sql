-- Insert Test Data for SQL Agent Testing
-- Run this in MySQL Workbench to populate the database with example data

USE lama;

-- ============================================
-- CLEAR EXISTING DATA (Optional - uncomment if you want fresh data)
-- ============================================
-- DELETE FROM signature_forms;
-- DELETE FROM hubspot_integrations;
-- DELETE FROM quotes;
-- DELETE FROM templates;

-- ============================================
-- 10 TEMPLATES
-- ============================================
INSERT IGNORE INTO templates (id, name, description, file_name, file_type, file_data, file_size, is_default, created_at) VALUES
('tpl-001', 'Standard Agreement Template', 'Standard service agreement template for all clients', 'standard-agreement.docx', 'docx', 'template data 1', 45000, true, '2025-01-15 10:00:00'),
('tpl-002', 'Premium Service Agreement', 'Premium tier service agreement with additional terms', 'premium-agreement.docx', 'docx', 'template data 2', 52000, false, '2025-01-20 11:30:00'),
('tpl-003', 'Enterprise Contract', 'Enterprise-level contract template with custom clauses', 'enterprise-contract.docx', 'docx', 'template data 3', 68000, false, '2025-02-01 09:15:00'),
('tpl-004', 'Basic Plan Agreement', 'Basic plan agreement template for small businesses', 'basic-agreement.docx', 'docx', 'template data 4', 38000, false, '2025-02-10 14:20:00'),
('tpl-005', 'NDA Template', 'Non-disclosure agreement template', 'nda-template.pdf', 'pdf', 'template data 5', 25000, false, '2025-02-15 16:45:00'),
('tpl-006', 'SLA Agreement', 'Service level agreement template', 'sla-agreement.docx', 'docx', 'template data 6', 55000, false, '2025-02-20 10:30:00'),
('tpl-007', 'Partnership Agreement', 'Partnership and collaboration agreement', 'partnership-agreement.docx', 'docx', 'template data 7', 72000, false, '2025-03-01 13:00:00'),
('tpl-008', 'Renewal Contract', 'Contract renewal template', 'renewal-contract.pdf', 'pdf', 'template data 8', 42000, false, '2025-03-05 11:15:00'),
('tpl-009', 'Addendum Template', 'Contract addendum template', 'addendum-template.docx', 'docx', 'template data 9', 30000, false, '2025-03-10 15:30:00'),
('tpl-010', 'Termination Agreement', 'Service termination agreement template', 'termination-agreement.docx', 'docx', 'template data 10', 35000, false, '2025-03-15 09:00:00');

-- ============================================
-- 10 QUOTES (Clients)
-- ============================================
INSERT IGNORE INTO quotes (id, client_name, client_email, company, configuration, selected_tier, calculation, status, created_at) VALUES
('quote-001', 'John Smith', 'john.smith@acmecorp.com', 'Acme Corporation', '{"users": 50, "storage": 500}', '{"tier": "standard"}', '{"total": 5000}', 'accepted', '2025-01-10 10:00:00'),
('quote-002', 'Sarah Johnson', 'sarah.j@techstart.io', 'TechStart Inc', '{"users": 25, "storage": 200}', '{"tier": "basic"}', '{"total": 2500}', 'sent', '2025-01-15 11:30:00'),
('quote-003', 'Michael Chen', 'm.chen@globaltech.com', 'GlobalTech Solutions', '{"users": 200, "storage": 2000}', '{"tier": "advanced"}', '{"total": 15000}', 'viewed', '2025-01-20 09:15:00'),
('quote-004', 'Emily Davis', 'emily.d@innovate.com', 'Innovate Labs', '{"users": 75, "storage": 800}', '{"tier": "standard"}', '{"total": 6000}', 'draft', '2025-02-01 14:20:00'),
('quote-005', 'Robert Wilson', 'r.wilson@megacorp.com', 'MegaCorp Industries', '{"users": 500, "storage": 5000}', '{"tier": "advanced"}', '{"total": 35000}', 'accepted', '2025-02-05 16:45:00'),
('quote-006', 'Lisa Anderson', 'lisa.a@startup.io', 'StartupCo', '{"users": 10, "storage": 100}', '{"tier": "basic"}', '{"total": 1200}', 'rejected', '2025-02-10 10:30:00'),
('quote-007', 'David Brown', 'd.brown@enterprise.com', 'Enterprise Systems', '{"users": 300, "storage": 3000}', '{"tier": "advanced"}', '{"total": 25000}', 'sent', '2025-02-15 13:00:00'),
('quote-008', 'Jennifer Lee', 'j.lee@cloudtech.com', 'CloudTech Solutions', '{"users": 100, "storage": 1000}', '{"tier": "standard"}', '{"total": 8000}', 'viewed', '2025-02-20 11:15:00'),
('quote-009', 'James Taylor', 'j.taylor@digital.com', 'Digital Innovations', '{"users": 150, "storage": 1500}', '{"tier": "standard"}', '{"total": 10000}', 'accepted', '2025-03-01 15:30:00'),
('quote-010', 'Maria Garcia', 'm.garcia@nextgen.com', 'NextGen Technologies', '{"users": 50, "storage": 500}', '{"tier": "standard"}', '{"total": 5000}', 'sent', '2025-03-05 09:00:00');

-- ============================================
-- 10 HUBSPOT INTEGRATIONS (DEALS)
-- ============================================
INSERT IGNORE INTO hubspot_integrations (id, quote_id, contact_id, deal_id, status, created_at) VALUES
('deal-001', 'quote-001', 'contact-001', 'hs-deal-001', 'success', '2025-01-12 10:30:00'),
('deal-002', 'quote-002', 'contact-002', 'hs-deal-002', 'pending', '2025-01-16 11:45:00'),
('deal-003', 'quote-003', 'contact-003', 'hs-deal-003', 'success', '2025-01-22 09:30:00'),
('deal-004', 'quote-004', 'contact-004', 'hs-deal-004', 'failed', '2025-02-02 14:45:00'),
('deal-005', 'quote-005', 'contact-005', 'hs-deal-005', 'success', '2025-02-07 16:00:00'),
('deal-006', 'quote-006', 'contact-006', 'hs-deal-006', 'success', '2025-02-12 10:15:00'),
('deal-007', 'quote-007', 'contact-007', 'hs-deal-007', 'pending', '2025-02-17 13:30:00'),
('deal-008', 'quote-008', 'contact-008', 'hs-deal-008', 'success', '2025-02-22 11:45:00'),
('deal-009', 'quote-009', 'contact-009', 'hs-deal-009', 'success', '2025-03-03 15:00:00'),
('deal-010', 'quote-010', 'contact-010', 'hs-deal-010', 'pending', '2025-03-07 09:30:00');

-- ============================================
-- 10 SIGNATURE FORMS (APPROVALS)
-- ============================================
INSERT IGNORE INTO signature_forms (form_id, quote_id, client_email, client_name, quote_data, status, approval_status, client_comments, created_at, expires_at, completed_at) VALUES
('form-001', 'quote-001', 'john.smith@acmecorp.com', 'John Smith', '{"total": 5000, "tier": "standard"}', 'completed', 'approved', 'Looks good, approved', '2025-01-11 10:00:00', '2025-01-18 10:00:00', '2025-01-13 14:30:00'),
('form-002', 'quote-002', 'sarah.j@techstart.io', 'Sarah Johnson', '{"total": 2500, "tier": "basic"}', 'pending', 'pending', NULL, '2025-01-16 11:30:00', '2025-01-23 11:30:00', NULL),
('form-003', 'quote-003', 'm.chen@globaltech.com', 'Michael Chen', '{"total": 15000, "tier": "advanced"}', 'completed', 'approved', 'Approved after review', '2025-01-21 09:15:00', '2025-01-28 09:15:00', '2025-01-25 16:00:00'),
('form-004', 'quote-004', 'emily.d@innovate.com', 'Emily Davis', '{"total": 6000, "tier": "standard"}', 'pending', 'pending', NULL, '2025-02-02 14:20:00', '2025-02-09 14:20:00', NULL),
('form-005', 'quote-005', 'r.wilson@megacorp.com', 'Robert Wilson', '{"total": 35000, "tier": "advanced"}', 'completed', 'approved', 'Executive approval granted', '2025-02-06 16:45:00', '2025-02-13 16:45:00', '2025-02-08 10:00:00'),
('form-006', 'quote-006', 'lisa.a@startup.io', 'Lisa Anderson', '{"total": 1200, "tier": "basic"}', 'completed', 'rejected', 'Budget constraints', '2025-02-11 10:30:00', '2025-02-18 10:30:00', '2025-02-12 11:00:00'),
('form-007', 'quote-007', 'd.brown@enterprise.com', 'David Brown', '{"total": 25000, "tier": "advanced"}', 'pending', 'pending', NULL, '2025-02-16 13:00:00', '2025-02-23 13:00:00', NULL),
('form-008', 'quote-008', 'j.lee@cloudtech.com', 'Jennifer Lee', '{"total": 8000, "tier": "standard"}', 'completed', 'approved', 'Approved by legal team', '2025-02-21 11:15:00', '2025-02-28 11:15:00', '2025-02-24 15:30:00'),
('form-009', 'quote-009', 'j.taylor@digital.com', 'James Taylor', '{"total": 10000, "tier": "standard"}', 'completed', 'approved', 'All terms acceptable', '2025-03-02 15:30:00', '2025-03-09 15:30:00', '2025-03-04 12:00:00'),
('form-010', 'quote-010', 'm.garcia@nextgen.com', 'Maria Garcia', '{"total": 5000, "tier": "standard"}', 'pending', 'pending', NULL, '2025-03-06 09:00:00', '2025-03-13 09:00:00', NULL);

-- ============================================
-- VERIFY DATA
-- ============================================
SELECT 'Templates' as TableName, COUNT(*) as Count FROM templates
UNION ALL
SELECT 'Quotes', COUNT(*) FROM quotes
UNION ALL
SELECT 'Deals', COUNT(*) FROM hubspot_integrations
UNION ALL
SELECT 'Approvals', COUNT(*) FROM signature_forms;

-- Show sample data
SELECT '=== TEMPLATES ===' as Info;
SELECT id, name, file_type, is_default, created_at FROM templates LIMIT 5;

SELECT '=== QUOTES ===' as Info;
SELECT id, client_name, company, status, created_at FROM quotes LIMIT 5;

SELECT '=== DEALS ===' as Info;
SELECT id, quote_id, deal_id, status, created_at FROM hubspot_integrations LIMIT 5;

SELECT '=== APPROVALS ===' as Info;
SELECT form_id, client_name, approval_status, status, created_at FROM signature_forms LIMIT 5;

