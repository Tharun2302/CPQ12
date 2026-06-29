# CPQ12 — Configure, Price, Quote Platform

## Project Overview

CPQ12 is an enterprise-grade Configure, Price, Quote (CPQ) platform designed for companies to generate accurate pricing quotes with complex product configurations, tiered discounts, and document generation.

**Core Capabilities:**
- Product configuration builder (multiple combinations)
- Dynamic pricing engine with discount logic
- Document generation (DOCX, PDF)
- Quote templates with rich text editor
- Exhibit management (bulk uploads, cloud storage)
- E-signature integration
- Multi-tenant support

**Business Goal:** Enable sales teams to generate professional quotes in minutes, not hours.

---

## Tech Stack

### Frontend
- **Framework:** React 18 + Vite
- **Styling:** TailwindCSS + PostCSS
- **State Management:** React Context
- **Router:** React Router v7
- **Rich Text:** TipTap editor
- **PDF Preview:** pdf.js, jsPDF
- **Drag & Drop:** react-dnd, react-rnd
- **Auth:** Azure AD (MSAL)

### Backend
- **Runtime:** Node.js (v18+, CommonJS)
- **Server:** Express.js v5
- **Database:** MongoDB (primary) + PostgreSQL (signatures)
- **ORM:** Mongoose
- **File Upload:** Multer
- **Document Generation:** docxtemplater, puppeteer, libreoffice-convert, sharp
- **Email:** SendGrid
- **Auth:** JWT + Azure AD integration

### Infrastructure
- **Containerization:** Docker + docker-compose
- **Document Conversion:** OnlyOffice, LibreOffice
- **Storage:** Local filesystem (uploads/, backend-exhibits/, backend-templates/)
- **Cloud Integration:** Egnyte, SharePoint, Google Drive, Dropbox (beta)

---

## Coding Conventions

### React Components (Frontend)
- **Naming:** PascalCase (e.g., `PricingCalculator.jsx`)
- **File Structure:** `src/components/[Feature]/[Component].jsx`
- **Max Lines:** 300 lines per component (split if larger)
- **Props Validation:** Use PropTypes or TypeScript interfaces
- **Hooks:** Use custom hooks for complex logic
- **State:** Use Context for global state, useState for local

### Node.js API Routes (Backend)
- **Naming:** camelCase (e.g., `/api/quotes/generate`, `/api/exhibits/upload`)
- **HTTP Methods:** GET (fetch), POST (create), PUT (update), DELETE (remove)
- **Error Handling:** Always return { success, data, error } structure
- **Validation:** Validate input on every endpoint
- **Logging:** Log errors with context (endpoint, user, payload)

### Database Schemas
- **Collections:** camelCase (e.g., `userQuotes`, `exhibitCombinations`)
- **Fields:** camelCase (e.g., `createdAt`, `discountPercentage`)
- **Indexes:** Add on frequently queried fields (createdAt, userId, combinationId)
- **Validation:** Use Mongoose schema validation

### File Naming
- **React:** `ComponentName.jsx`
- **Utilities:** `camelCaseName.js`
- **Hooks:** `useCustomHook.js`
- **API Routes:** `routeName.cjs`
- **Scripts:** `kebab-case.cjs`

---

## Architecture Notes

### Pricing Logic
- **Location:** `src/pricing-logic.js` + `server.cjs` pricing endpoints
- **Key Entities:** Plans (Basic, Standard, Advanced, Custom), Combinations (product + storage + tier), Discounts (3-tier, multi-pack)
- **Calculation Flow:** Base price → Apply plan multiplier → Apply combination discount → Apply promotional discount → Final price
- **Critical Rules:**
  - Always validate discount percentages (0-100)
  - Check for duplicate combinations before saving
  - Log all pricing changes with timestamp

### Document Generation
- **Templates:** `/backend-templates/` (DOCX templates with placeholders)
- **Flow:** User selects template → Data filled in → LibreOffice converts → User downloads
- **Supported Formats:** DOCX → PDF, DOCX → HTML
- **Tools:** docxtemplater (template processing), puppeteer (PDF from HTML)

### Exhibit Management
- **Structure:** Exhibits linked to combinations (many-to-many)
- **Upload:** Multer middleware handles file storage
- **Cloud Sync:** Integration with Egnyte/SharePoint/Google Drive (in progress)
- **Metadata:** Store `fileType`, `uploadedAt`, `uploadedBy`, `combinationId`

### Authentication
- **Strategy:** Azure AD (MSAL) for SSO + JWT for session
- **Flow:** User logs in via Azure → JWT token issued → Token sent with API requests
- **Session:** Tokens stored in localStorage (client-side)

---

## Hard Rules (Non-Negotiable)

1. **No Secrets in Code:** API keys, DB passwords, Azure secrets → `.env` only
2. **Error Handling:** Every API endpoint must handle errors gracefully (try-catch or error middleware)
3. **Pricing Logic:** Changes to pricing must include test cases for all 12 combinations
4. **Database Queries:** No unvalidated user input in MongoDB queries (prevent injection)
5. **Exports:** All exports must be documented (what they do, expected input/output)
6. **Testing:** New pricing features must have unit tests before merge
7. **Logging:** All API errors must be logged with context (user ID, endpoint, error message)

---

## Team Workflow

### Person A (Frontend)
- **Owns:** React components, UI/UX, form handling, client-side logic
- **Responsibilities:**
  - Build pricing calculator UI
  - Implement quote form workflows
  - Handle Azure AD login
  - Responsive design (mobile-first)
- **Review Before:** Style compliance, accessibility, performance
- **Collaborate With:** Person B for API contracts

### Person B (Backend)
- **Owns:** API routes, database models, document generation, cloud integrations
- **Responsibilities:**
  - Build REST endpoints
  - Implement pricing calculations
  - Handle file uploads & conversions
  - Manage cloud storage integrations
- **Review Before:** Security, error handling, database efficiency
- **Collaborate With:** Person A for API response shapes

### Shared Responsibilities
- Code reviews (both review each other's PRs)
- Bug triage (both investigate reported issues)
- Pricing logic changes (both verify calculations work)
- Deployment (Person B leads, Person A verifies UI)

### Communication Protocol
- **Daily:** 10 AM standup (slack or voice, 5 min)
- **PRs:** Code review within 4 hours
- **Blocking Issues:** Slack immediately
- **Documentation:** Update this file when rules change

---

## Development Setup

```bash
# Install dependencies
npm install

# Run dev server (both frontend + backend)
npm run dev:all

# Frontend: http://localhost:5173
# Backend: http://localhost:3000

# Build for production
npm run build
npm start

# Lint code
npm lint
```

---

## Deployment

- **Development:** Local machine (npm run dev:all)
- **Staging:** Docker container (docker-compose up)
- **Production:** [Your deployment platform] (manual via `/deploy` command)

---

## Key Files

| File | Purpose |
|---|---|
| `server.cjs` | Main backend server (Express setup, routes, middleware) |
| `src/App.jsx` | Main React component, router setup |
| `pricing-logic.js` | Pricing calculation engine |
| `src/components/PricingCalculator.jsx` | Main pricing UI component |
| `.env` | Environment variables (secrets, DB URLs, API keys) |
| `package.json` | Dependencies, scripts |

---

## Safety Checklist

Before pushing code:
- [ ] No console.log() statements left
- [ ] Error messages are user-friendly
- [ ] API responses include error handling
- [ ] No hardcoded API URLs or secrets
- [ ] Tests pass (if new feature)
- [ ] Code reviewed by teammate
