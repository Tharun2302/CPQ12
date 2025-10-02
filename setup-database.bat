@echo off
echo 🚀 Setting up CPQ Pro MySQL database...
echo.

echo 📊 Creating database and tables...
mysql -u root -proot -e "CREATE DATABASE IF NOT EXISTS cpq_database1;"
mysql -u root -proot -e "USE cpq_database1;"

echo 📋 Creating quotes table...
mysql -u root -proot -e "USE cpq_database1; CREATE TABLE IF NOT EXISTS quotes (id VARCHAR(36) PRIMARY KEY, client_name VARCHAR(255) NOT NULL, client_email VARCHAR(255) NOT NULL, company VARCHAR(255), configuration JSON, selected_tier JSON, calculation JSON, status ENUM('draft', 'sent', 'viewed', 'accepted', 'rejected') DEFAULT 'draft', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);"

echo 💰 Creating pricing_tiers table...
mysql -u root -proot -e "USE cpq_database1; CREATE TABLE IF NOT EXISTS pricing_tiers (id VARCHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, per_user_cost DECIMAL(10,2) NOT NULL, per_gb_cost DECIMAL(10,2) NOT NULL, managed_migration_cost DECIMAL(10,2) NOT NULL, instance_cost DECIMAL(10,2) NOT NULL, user_limits JSON, gb_limits JSON, features JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);"

echo 🔗 Creating hubspot_integrations table...
mysql -u root -proot -e "USE cpq_database1; CREATE TABLE IF NOT EXISTS hubspot_integrations (id VARCHAR(36) PRIMARY KEY, quote_id VARCHAR(36), contact_id VARCHAR(255), deal_id VARCHAR(255), status ENUM('pending', 'success', 'failed') DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE);"

echo 📝 Inserting default pricing tiers...
mysql -u root -proot -e "USE cpq_database1; INSERT IGNORE INTO pricing_tiers (id, name, per_user_cost, per_gb_cost, managed_migration_cost, instance_cost, user_limits, gb_limits, features) VALUES ('basic', 'Basic', 25.00, 2.50, 500.00, 100.00, '{\"from\": 1, \"to\": 50}', '{\"from\": 10, \"to\": 500}', '[\"Basic support\", \"Standard migration\", \"Email support\", \"Basic reporting\"]');"

mysql -u root -proot -e "USE cpq_database1; INSERT IGNORE INTO pricing_tiers (id, name, per_user_cost, per_gb_cost, managed_migration_cost, instance_cost, user_limits, gb_limits, features) VALUES ('standard', 'Standard', 45.00, 4.00, 750.00, 200.00, '{\"from\": 51, \"to\": 200}', '{\"from\": 501, \"to\": 2000}', '[\"Priority support\", \"Advanced migration\", \"Phone support\", \"Advanced reporting\", \"Custom integrations\"]');"

mysql -u root -proot -e "USE cpq_database1; INSERT IGNORE INTO pricing_tiers (id, name, per_user_cost, per_gb_cost, managed_migration_cost, instance_cost, user_limits, gb_limits, features) VALUES ('advanced', 'Advanced', 75.00, 6.50, 1000.00, 350.00, '{\"from\": 201, \"to\": 1000}', '{\"from\": 2001, \"to\": 10000}', '[\"Dedicated support\", \"Premium migration\", \"24/7 support\", \"Enterprise reporting\", \"Full customization\", \"SLA guarantee\"]');"

echo.
echo 🎉 Database setup completed!
echo 🚀 You can now start the server with: node server.js
echo.
pause
