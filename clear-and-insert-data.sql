-- Clear existing data and insert fresh test data
-- Use this if you want to start fresh

USE lama;

-- Clear existing data (in correct order due to foreign keys)
DELETE FROM signature_forms;
DELETE FROM hubspot_integrations;
DELETE FROM quotes;
DELETE FROM templates;

-- Now insert fresh data (use the INSERT statements from insert-test-data.sql)
-- Copy the INSERT statements from insert-test-data.sql here, or run both files

