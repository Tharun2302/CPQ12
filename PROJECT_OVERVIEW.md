# CPQ12 Project - Complete Functionality Overview

## 🎯 Project Overview

**CPQ12** is a comprehensive **Configure, Price, Quote (CPQ)** application designed for generating quotes and managing agreements for cloud migration services. The application handles the complete workflow from deal information to final document generation, approval workflows, and client signatures.

### Technology Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js, Express.js
- **Database**: MongoDB Atlas
- **Authentication**: Microsoft OAuth, JWT-based authentication
- **Email**: SendGrid
- **Document Processing**: LibreOffice, PDF-lib, docx-preview
- **Analytics**: Microsoft Clarity
- **Deployment**: Docker, DigitalOcean

---

## 🏗️ Architecture Overview

### Frontend Structure
```
src/
├── components/          # React components
│   ├── Dashboard.tsx           # Main dashboard with tab navigation
│   ├── ConfigurationForm.tsx  # Project configuration input
│   ├── QuoteGenerator.tsx     # Quote generation and document processing
│   ├── QuoteManager.tsx       # Document/quotes management
│   ├── DealDetails.tsx        # HubSpot deal information display
│   ├── ExhibitSelector.tsx    # Exhibit selection for quotes
│   ├── TemplateManager.tsx    # Template management
│   ├── ApprovalWorkflow.tsx   # Approval workflow initiation
│   └── auth/                  # Authentication components
├── utils/              # Utility functions
│   ├── pricing.ts            # Pricing calculations
│   ├── templateProcessor.ts  # Template processing
│   ├── docxTemplateProcessor.ts  # DOCX template processing
│   ├── pdfOrchestrator.ts    # PDF generation orchestration
│   └── emailservice.ts       # Email service
├── services/          # Service layer
│   ├── documentService.ts    # Document management
│   └── approvalWorkflowServiceMongoDB.ts  # Approval workflows
├── contexts/          # React contexts
│   └── AuthContext.tsx       # Authentication context
└── config/            # Configuration
    ├── api.ts         # API endpoints
    └── msalConfig.ts  # Microsoft auth config
```

### Backend Structure
```
server.cjs             # Main Express server
├── MongoDB Connection & Initialization
├── Authentication Endpoints
├── Quote Management
├── Template Management
├── Document Processing
├── HubSpot Integration
├── Email Services
├── Approval Workflows
└── Digital Signatures
```

---

## 🔄 Core Workflows

### 1. **Deal Information Flow**
```
HubSpot Deal → Deal Details Page → Use Deal Data → Configuration Form
```
- Users can access deal information from HubSpot
- Deal data includes: company, contact, deal amount, stage
- Data can be automatically populated into configuration form

### 2. **Configuration & Pricing Flow**
```
Configuration Form → Calculate Pricing → Select Tier → Generate Quote
```

**Configuration Options:**
- **Migration Types**: 
  - Messaging (Slack, Teams, etc.)
  - Content (Box, Dropbox, OneDrive, SharePoint, etc.)
  - Email (Gmail, Outlook)
  - Multi combination (multiple types)
  - Overage Agreement

- **Configuration Fields:**
  - Number of Users
  - Instance Type (Small, Standard, Large, Extra Large)
  - Number of Instances
  - Duration (months)
  - Data Size (GB)
  - Messages/Channels (for messaging)
  - Start/End Dates

**Pricing Tiers:**
- **Basic**: $30/user, $1/GB, $300 migration, $500 instance
- **Standard**: $35/user, $1.50/GB, $300 migration, $500 instance
- **Advanced**: $40/user, $1.80/GB, $300 migration, $500 instance

**Pricing Calculation:**
- User cost based on tier and user count (volume discounts)
- Data cost (GB-based)
- Instance cost (instance type × duration × count)
- Migration cost (managed migration fee)
- Minimum total: $2,500

### 3. **Quote Generation Flow**
```
Select Template → Fill Client Info → Generate Agreement → Download/Send
```

**Template Processing:**
- Supports DOCX templates (primary method)
- Token replacement in templates
- Dynamic exhibit insertion
- PDF conversion
- Multi-combination support with separate configs

**Quote Data Includes:**
- Client information (name, email, company)
- Configuration details
- Pricing calculation
- Selected exhibits
- Template-specific data

### 4. **Document Management Flow**
```
Generate Document → Save to MongoDB → View/Download → Send to Client
```

**Document Features:**
- Store in MongoDB `documents` collection
- Preview functionality
- Download as PDF
- Email with attachment
- Status tracking (draft, sent, signed, etc.)

### 5. **Approval Workflow Flow**
```
Start Workflow → Team Approval → Technical Team → Legal Team → Deal Desk
```

**Approval Steps:**
1. **Team Approval** (SMB, Mid-Market, Enterprise, Strategic)
   - Selects appropriate team based on deal size
   - Can auto-approve Technical Team step for overage agreements

2. **Technical Team**
   - Reviews technical feasibility
   - Email: `cpq.zenop.ai.technical@cloudfuze.com`

3. **Legal Team**
   - Reviews legal terms
   - Email: `cpq.zenop.ai.legal@cloudfuze.com`

4. **Deal Desk**
   - Final approval
   - Email: `cpq.zenop.ai.dealdesk@cloudfuze.com`

**Workflow Features:**
- Email notifications at each step
- Comments and feedback
- Status tracking
- Dashboard views for each approval role
- Automatic progression on approval

### 6. **Digital Signature Flow**
```
Create Signature Form → Send to Client → Client Signs → Store Signature
```

**Signature Features:**
- Unique form IDs
- Client-facing signature page
- Signature capture
- PDF generation with signature
- Analytics tracking
- Expiration dates

---

## 🔌 Integrations

### 1. **HubSpot Integration**

**Features:**
- Deal information retrieval
- Contact management
- Deal creation
- Automatic data population

**Endpoints:**
- `GET /api/hubspot/deals/:dealId` - Get deal details
- `GET /api/hubspot/contacts` - List contacts
- `POST /api/hubspot/contacts` - Create contact
- `GET /api/hubspot/deals` - List deals

**Authentication:**
- HubSpot API key authentication
- Automatic bypass for HubSpot-originated users
- URL parameter detection (`?hubspot=true`)

### 2. **Microsoft OAuth**

**Features:**
- Single Sign-On (SSO)
- User profile retrieval
- Automatic user creation/update

**Flow:**
```
User clicks "Sign in with Microsoft" → OAuth redirect → Callback → JWT token → Dashboard
```

### 3. **Email Integration (SendGrid)**

**Features:**
- Quote delivery to clients
- Approval workflow notifications
- Manager/CEO notifications
- Team approval emails
- Attachment support

**Email Types:**
- Client quote emails
- Approval request emails
- Approval status updates
- Denial notifications

---

## 📊 Database Structure

### MongoDB Collections

1. **users**
   - User accounts (email, name, provider)
   - Authentication data
   - Indexes: email (unique), provider, created_at

2. **documents**
   - Generated quotes/agreements
   - PDF files (stored as binary)
   - Metadata (client, configuration, pricing)
   - Indexes: id (unique), company, clientEmail, generatedDate, status

3. **templates**
   - DOCX/PDF templates
   - Template metadata
   - File storage
   - Indexes: file_type, is_default, created_at

4. **exhibits**
   - Exhibit documents (feature lists)
   - Categorized by migration type
   - Combination associations
   - Plan-based filtering (Basic/Standard/Advanced)

5. **quotes**
   - Quote records
   - Configuration snapshots
   - Pricing calculations

6. **signature_forms**
   - Digital signature forms
   - Client information
   - Signature data
   - Status tracking
   - Indexes: form_id (unique), quote_id, status, expires_at

7. **approval_workflows**
   - Workflow instances
   - Step tracking
   - Approval status
   - Comments and timestamps

8. **daily_logins**
   - Login tracking
   - User analytics
   - Index: date (unique)

---

## 🔑 Key API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/microsoft` - Microsoft OAuth callback

### Quotes & Documents
- `POST /api/quotes` - Create quote
- `GET /api/quotes` - List quotes
- `PUT /api/quotes/:id` - Update quote
- `DELETE /api/quotes/:id` - Delete quote
- `POST /api/documents` - Create document
- `GET /api/documents` - List documents
- `GET /api/documents/:id` - Get document
- `GET /api/documents/:id/file` - Download document
- `GET /api/documents/:id/preview` - Preview document

### Templates
- `POST /api/templates` - Upload template
- `GET /api/templates` - List templates
- `GET /api/templates/:id/file` - Download template
- `PUT /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template

### Exhibits
- `GET /api/exhibits` - List exhibits
- `GET /api/exhibits/:id/file` - Download exhibit

### Document Processing
- `POST /api/convert/docx-to-pdf` - Convert DOCX to PDF
- `POST /api/documents/upload` - Upload document

### Email
- `POST /api/email/send` - Send email
- `POST /api/send-client-email` - Send client email
- `POST /api/send-manager-email` - Send manager email
- `POST /api/send-ceo-email` - Send CEO email
- `POST /api/send-approval-emails` - Send approval emails

### Approval Workflows
- `POST /api/approval-workflows` - Create workflow
- `GET /api/approval-workflows` - List workflows
- `GET /api/approval-workflows/:id` - Get workflow
- `PUT /api/approval-workflows/:id` - Update workflow
- `PUT /api/approval-workflows/:id/step/:stepNumber` - Update workflow step
- `DELETE /api/approval-workflows/:id` - Delete workflow

### Digital Signatures
- `POST /api/signature/create-form` - Create signature form
- `GET /api/signature/form/:formId` - Get signature form
- `POST /api/signature/submit` - Submit signature
- `GET /api/signature/forms-by-quote/:quoteId` - Get forms by quote
- `GET /api/signature/analytics` - Get signature analytics

### HubSpot
- `GET /api/hubspot/contacts` - List contacts
- `GET /api/hubspot/contacts/:contactId` - Get contact
- `POST /api/hubspot/contacts` - Create contact
- `GET /api/hubspot/deals` - List deals
- `GET /api/hubspot/deals/:dealId` - Get deal

---

## 🎨 Key Components

### 1. **Dashboard** (`src/components/Dashboard.tsx`)
- Main navigation hub
- Tab-based interface (Deal, Configure, Quote, Documents, Templates, Approval)
- Session state management
- URL-based routing

### 2. **ConfigurationForm** (`src/components/ConfigurationForm.tsx`)
- Project configuration input
- Migration type selection
- Combination selection
- Exhibit selection
- Contact information
- Template selection
- Auto-saves to sessionStorage

### 3. **QuoteGenerator** (`src/components/QuoteGenerator.tsx`)
- Quote generation interface
- Client information form
- Template processing
- Document generation
- Download functionality
- Email sending
- Approval workflow initiation

### 4. **QuoteManager** (`src/components/QuoteManager.tsx`)
- Document/quotes listing
- Search and filter
- Status management
- Preview functionality
- Download/email actions

### 5. **ExhibitSelector** (`src/components/ExhibitSelector.tsx`)
- Exhibit selection interface
- Tier-based filtering (Basic/Standard/Advanced)
- Multi-selection support
- Required exhibit auto-selection

### 6. **Approval Dashboards**
- **TeamApprovalDashboard**: Team-level approvals
- **TechnicalTeamApprovalDashboard**: Technical team approvals
- **LegalTeamApprovalDashboard**: Legal team approvals
- **ApprovalDashboard**: General approval tracking

### 7. **TemplateManager** (`src/components/TemplateManager.tsx`)
- Template upload/management
- Template selection
- Preview functionality
- Template metadata editing

---

## 🔐 Authentication & Security

### Authentication Methods
1. **Email/Password**: Traditional login
2. **Microsoft OAuth**: SSO via Microsoft
3. **HubSpot Bypass**: Automatic auth for HubSpot users

### Security Features
- JWT token-based authentication
- Password hashing (bcrypt)
- CORS configuration
- Environment variable protection
- Input sanitization (emoji removal, email validation)

---

## 📈 Analytics & Tracking

### Microsoft Clarity Integration
- User behavior tracking
- Event tracking (tier selection, quote generation, approvals)
- User identification
- Performance monitoring

### Custom Events Tracked
- `user.sign_in` - User login
- `tier.selected` - Pricing tier selection
- `pricing.calculated` - Pricing calculation
- `quote.generated` - Quote generation
- `document.downloaded` - Document download
- `approval.action` - Approval actions

---

## 🚀 Deployment

### Environment Variables
```
# Backend
PORT=3001
MONGODB_URI=mongodb://...
DB_NAME=cpq_database
JWT_SECRET=...
SENDGRID_API_KEY=...
HUBSPOT_API_KEY=...

# Frontend
VITE_BACKEND_URL=https://zenop.ai
VITE_CLARITY_ID=...
VITE_HUBSPOT_API_KEY=...
```

### Docker Support
- Dockerfile for application
- Dockerfile.libreoffice for document conversion
- docker-compose.yml for orchestration

---

## 🎯 Key Features Summary

1. **Multi-Migration Type Support**: Messaging, Content, Email, Multi-combination
2. **Dynamic Pricing**: Volume-based discounts, tier-based pricing
3. **Template System**: DOCX template processing with token replacement
4. **Exhibit Management**: Dynamic exhibit selection and insertion
5. **Approval Workflows**: Multi-step approval with email notifications
6. **Digital Signatures**: Client signature collection and tracking
7. **HubSpot Integration**: Seamless CRM integration
8. **Document Management**: Full document lifecycle management
9. **Email System**: Automated email notifications
10. **Analytics**: User behavior and event tracking

---

## 📝 Notes

- The application uses `zenop.ai` domain for production
- Session state is preserved in localStorage/sessionStorage
- Templates are cached for performance
- LibreOffice is used for DOCX to PDF conversion
- All file uploads use multer with memory storage
- MongoDB indexes are created automatically on startup

---

This overview provides a comprehensive understanding of the CPQ12 application's functionality, architecture, and workflows.

