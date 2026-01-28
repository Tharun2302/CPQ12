# Migration Tracking Implementation Guide

## Overview

This document describes the **database-backed migration tracking system** that replaces Excel-based tracking with a comprehensive UI dashboard integrated with MongoDB.

## Why Database-Backed UI Dashboard (Not Excel)?

### ✅ **Advantages of Database-Backed Solution:**

1. **Real-Time Updates**: Automatic tracking of migration progress without manual data entry
2. **Integration**: Seamlessly integrates with existing approval workflows and migration lifecycle
3. **Collaboration**: Multiple users can access and update data simultaneously
4. **Audit Trail**: Complete history of all transactions and changes
5. **Scalability**: Handles large volumes of data efficiently
6. **Analytics**: Built-in reporting and progress tracking
7. **Data Integrity**: Prevents errors through validation and constraints

### ❌ **Excel Limitations:**

- Manual data entry (error-prone)
- No real-time updates
- No integration with system
- Difficult collaboration
- Limited scalability
- No audit trail

## Architecture

### MongoDB Collections

1. **`migration_projects`**: Stores project information
   - Indexes: `id` (unique), `projectName`, `clientName`, `createdAt`, `managerName`

2. **`migration_batches`**: Tracks batches within projects
   - Indexes: `id` (unique), `projectId`, `serverId`, `status`, `startDate`

3. **`migration_servers`**: Manages servers linked to projects
   - Indexes: `id` (unique), `projectId`, `name`

4. **`migration_transactions`**: Tracks timeline transactions for migration progress
   - Indexes: `id` (unique), `projectId`, `batchId`, `serverId`, `timestamp`, `status`

## API Endpoints

### Projects

- `GET /api/migration-tracking/projects` - Get all projects
- `GET /api/migration-tracking/projects/:id` - Get project with batches, servers, and transaction count
- `POST /api/migration-tracking/projects` - Create new project
- `PUT /api/migration-tracking/projects/:id` - Update project
- `DELETE /api/migration-tracking/projects/:id` - Delete project (cascades to batches, servers, transactions)

### Batches

- `POST /api/migration-tracking/batches` - Create batch
- `PUT /api/migration-tracking/batches/:id` - Update batch (handles server linking)
- `DELETE /api/migration-tracking/batches/:id` - Delete batch

### Servers

- `POST /api/migration-tracking/servers` - Create server
- `PUT /api/migration-tracking/servers/:id` - Update server
- `DELETE /api/migration-tracking/servers/:id` - Delete server (unlinks batches)

### Transactions

- `POST /api/migration-tracking/transactions` - Create migration transaction
- `GET /api/migration-tracking/transactions` - Get transactions (with filters: projectId, batchId, serverId, status)

### Analytics

- `GET /api/migration-tracking/analytics/:projectId` - Get comprehensive progress analytics
  - Returns: batch progress, server progress, completion percentages, transaction counts

## Data Model

### Project
```typescript
{
  id: string;
  projectName: string;
  migrationType: string;
  combinationName: string;
  managerName: string;
  clientName: string;
  companyName: string;
  numberOfAdminAccounts: number;
  startDate: string;
  endDate: string;
  timelineTransition?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Batch
```typescript
{
  id: string;
  projectId: string;
  name: string;
  startDate: string;
  endDate: string;
  serverId?: string;
  status: 'not-started' | 'processing' | 'completed';
  createdAt: string;
  updatedAt: string;
}
```

### Server
```typescript
{
  id: string;
  projectId: string;
  name: string;
  batchIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

### Migration Transaction
```typescript
{
  id: string;
  projectId: string;
  batchId?: string;
  serverId?: string;
  transactionType: string;
  description: string;
  status: string;
  metadata: object;
  timestamp: string;
  createdAt: string;
}
```

## Usage Example

### Creating a Project with Batches and Servers

```javascript
// 1. Create project
const project = await fetch('/api/migration-tracking/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectName: 'Client ABC Migration',
    clientName: 'ABC Corp',
    companyName: 'ABC Corporation',
    migrationType: 'Box to SharePoint',
    managerName: 'John Doe'
  })
});

// 2. Create server
const server = await fetch('/api/migration-tracking/servers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: project.id,
    name: 'Server-01'
  })
});

// 3. Create batch linked to server
const batch = await fetch('/api/migration-tracking/batches', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: project.id,
    serverId: server.id,
    name: 'Batch-01',
    startDate: '2025-01-01',
    endDate: '2025-01-31'
  })
});

// 4. Track migration transaction
const transaction = await fetch('/api/migration-tracking/transactions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: project.id,
    batchId: batch.id,
    serverId: server.id,
    transactionType: 'migration',
    description: 'Migrated 1000 files',
    metadata: { fileCount: 1000, sizeGB: 50 }
  })
});

// 5. Get analytics
const analytics = await fetch(`/api/migration-tracking/analytics/${project.id}`);
```

## Next Steps

### Frontend Integration

1. **Update MigrationMonitoringDashboard.tsx**:
   - Replace localStorage with API calls
   - Use `fetch` or axios to call the new endpoints
   - Add loading states and error handling

2. **Create Migration Progress Component**:
   - Display real-time progress per batch/server
   - Show transaction counts and completion percentages
   - Add charts/graphs for visualization

3. **Add Transaction Tracking UI**:
   - Form to log migration transactions
   - Display transaction history
   - Filter by batch/server

### Benefits After Implementation

- ✅ Automatic progress tracking
- ✅ Real-time updates across all users
- ✅ Historical data and audit trail
- ✅ Analytics and reporting
- ✅ Integration with existing workflows
- ✅ Scalable to handle large migrations

## Migration from localStorage

If you have existing data in localStorage:

1. Export data from localStorage
2. Use a migration script to import into MongoDB
3. Update frontend to use API endpoints
4. Remove localStorage code

## Testing

Test the endpoints using:

```bash
# Test project creation
curl -X POST http://localhost:3001/api/migration-tracking/projects \
  -H "Content-Type: application/json" \
  -d '{"projectName":"Test Project","clientName":"Test Client","companyName":"Test Company"}'

# Test analytics
curl http://localhost:3001/api/migration-tracking/analytics/{projectId}
```

## Conclusion

The database-backed UI dashboard provides a superior solution compared to Excel for tracking migration progress. It offers real-time updates, integration, scalability, and comprehensive analytics - all essential for managing complex migration projects.
