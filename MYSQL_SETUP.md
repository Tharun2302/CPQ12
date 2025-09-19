# MySQL Database Setup Guide

## 🗄️ Database Configuration

- **Database Name**: `cpq_database1`
- **Username**: `root`
- **Password**: `root`
- **Host**: `localhost`
- **Port**: `3306`

---

## 🚀 Quick Setup

### Step 1: Install MySQL
If you don't have MySQL installed:

#### Windows:
1. Download MySQL Installer from [mysql.com](https://dev.mysql.com/downloads/installer/)
2. Run the installer and follow the setup wizard
3. Set root password as `root`

#### macOS:
```bash
brew install mysql
brew services start mysql
```

#### Linux (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install mysql-server
sudo mysql_secure_installation
```

### Step 2: Create Database
```bash
# Connect to MySQL
mysql -u root -p

# Enter password: root

# Run the setup script
source setup-database.sql;
```

### Step 3: Install Dependencies
```bash
# Install backend dependencies
npm install express cors node-fetch dotenv mysql2
npm install --save-dev nodemon
```

### Step 4: Start the Server
```bash
# Start the server
node server.js
```

---

## 📊 Database Schema

### Tables Created:

#### 1. `quotes` Table
- Stores all quote information
- Includes client details, configuration, and calculations
- JSON fields for complex data structures

#### 2. `pricing_tiers` Table
- Stores pricing tier configurations
- Includes costs, limits, and features
- Default tiers (Basic, Standard, Advanced) are pre-loaded

#### 3. `hubspot_integrations` Table
- Tracks HubSpot integration status
- Links quotes to HubSpot contacts and deals
- Foreign key relationship with quotes table

---

## 🔧 API Endpoints

### Database Health Check
- **GET** `/api/database/health` - Check database connection

### Quotes Management
- **GET** `/api/quotes` - Get all quotes
- **POST** `/api/quotes` - Save a new quote

### Pricing Tiers Management
- **GET** `/api/pricing-tiers` - Get all pricing tiers
- **POST** `/api/pricing-tiers` - Save a pricing tier

### HubSpot Integration
- **GET** `/api/hubspot/test` - Test HubSpot connection
- **POST** `/api/hubspot/contacts` - Create HubSpot contact
- **POST** `/api/hubspot/deals` - Create HubSpot deal

---

## 🛠️ Troubleshooting

### Common Issues:

#### 1. "MySQL connection failed"
- **Cause**: MySQL service not running
- **Solution**: Start MySQL service
  ```bash
  # Windows
  net start mysql
  
  # macOS
  brew services start mysql
  
  # Linux
  sudo systemctl start mysql
  ```

#### 2. "Access denied for user 'root'"
- **Cause**: Wrong password or user permissions
- **Solution**: Reset MySQL root password
  ```bash
  mysql -u root -p
  ALTER USER 'root'@'localhost' IDENTIFIED BY 'root';
  FLUSH PRIVILEGES;
  ```

#### 3. "Database doesn't exist"
- **Cause**: Database not created
- **Solution**: Run the setup script
  ```bash
  mysql -u root -p < setup-database.sql
  ```

#### 4. "Port 3306 already in use"
- **Cause**: Another MySQL instance running
- **Solution**: Stop other MySQL services or change port

---

## 📋 Environment Variables

Your `.env` file should contain:
```env
# HubSpot API Configuration
HUBSPOT_API_KEY=pat-na1-635cc313-80cb-4701-810a-a0492691b28d

# Application Configuration
VITE_APP_NAME=CPQ Pro
VITE_APP_VERSION=1.0.0
VITE_HUBSPOT_API_KEY=pat-na1-635cc313-80cb-4701-810a-a0492691b28d

# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=root
DB_NAME=cpq_database1
DB_PORT=3306
```

---

## 🎯 Features

### Data Persistence
- ✅ Quotes saved to database
- ✅ Pricing tiers stored in MySQL
- ✅ HubSpot integration tracking
- ✅ Automatic table creation

### Data Integrity
- ✅ Foreign key relationships
- ✅ JSON data validation
- ✅ Timestamp tracking
- ✅ Status enums

### Performance
- ✅ Connection pooling
- ✅ Prepared statements
- ✅ Indexed primary keys
- ✅ Efficient queries

---

## 🔒 Security

### Database Security
- ✅ Password-protected access
- ✅ Localhost-only connections
- ✅ Prepared statements prevent SQL injection
- ✅ Input validation

### API Security
- ✅ CORS configuration
- ✅ Error handling without data exposure
- ✅ Request validation
- ✅ Secure environment variables

---

## 📈 Monitoring

### Health Checks
- Database connection status
- API endpoint availability
- HubSpot integration status
- Server uptime monitoring

### Logging
- Database connection logs
- API request logs
- Error tracking
- Performance metrics

---

## 🚀 Production Deployment

### Database Setup
1. Use production MySQL server
2. Create dedicated database user
3. Set up proper backups
4. Configure monitoring

### Application Setup
1. Deploy backend server
2. Update environment variables
3. Set up SSL certificates
4. Configure load balancing

---

## 📞 Support

If you encounter issues:
1. Check MySQL service status
2. Verify database credentials
3. Run the setup script
4. Check server logs
5. Test database connection manually

### Manual Database Test
```bash
mysql -u root -p
USE cpq_database1;
SHOW TABLES;
SELECT * FROM pricing_tiers;
```
