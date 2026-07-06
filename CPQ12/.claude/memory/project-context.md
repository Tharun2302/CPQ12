# Project Context — CPQ12

## What Is CPQ12?

**Configure, Price, Quote Platform** — An enterprise application that helps sales teams generate accurate pricing quotes with complex product configurations, tiered discounts, and professional document generation.

## Business Goal

Enable sales teams to generate professional quotes in **minutes**, not hours, with automatic pricing calculations across 12+ product combinations.

## Key Challenges Solved

1. **Complex Pricing Logic**
   - Multiple discount tiers (3-tier, multi-pack, promotional)
   - Discount capping (max 50% per compliance)
   - Rounding accuracy (no customers undercharged)
   - Tested against all 12 combinations

2. **Document Generation**
   - DOCX templates with placeholders
   - Dynamic content filling
   - LibreOffice conversion to PDF
   - E-signature integration

3. **Exhibit Management**
   - Bulk file uploads
   - Cloud storage integration (Egnyte, SharePoint, Google Drive)
   - Metadata tracking
   - Exhibit-to-combination mapping

## Architecture Decisions

| Decision | Reason |
|---|---|
| **React + Vite Frontend** | Fast build times, modern tooling |
| **Node.js + Express Backend** | JavaScript across stack, rapid development |
| **MongoDB Primary DB** | Flexible schema for quote/exhibit data |
| **PostgreSQL Secondary** | E-signature data (structured, transactional) |
| **Mongoose ODM** | Schema validation, relationships |
| **LibreOffice** | Open-source document conversion |
| **TailwindCSS** | Rapid UI development, responsive design |
| **Azure AD Auth** | Enterprise SSO integration |

## Critical Code Areas

| Path | Why Critical | Who Owns |
|---|---|---|
| `pricing-logic.js` | Revenue calculations | Both (tests mandatory) |
| `server.cjs` | All API endpoints | Person B (Backend) |
| `src/pricing-calculator.jsx` | Main UI for quotes | Person A (Frontend) |
| `.env` | All secrets | Neither (local only) |

## Data Model

```
Users
  └─ UserQuotes (many)
      └─ Combinations (many) 
          └─ Exhibits (many)
          └─ DiscountRules (applied)
      └─ Templates (references)
```

## Current State (as of June 29, 2026)

**Completed:**
- ✅ Core pricing logic (all 12 combinations)
- ✅ Quote generation workflow
- ✅ DOCX template processing
- ✅ Azure AD authentication
- ✅ MongoDB document storage
- ✅ Exhibit upload (local storage)

**In Progress:**
- 🔄 Cloud storage integration (Egnyte/SharePoint)
- 🔄 E-signature improvements
- 🔄 Performance optimization (50K+ quotes)

**Not Started:**
- ❌ Advanced reporting/analytics
- ❌ Real-time collaboration
- ❌ Mobile app

## Team

- **Person A:** Frontend specialist (React, UX)
- **Person B:** Backend specialist (APIs, databases)
- **Both:** Code review, testing, deployment

## Deployment Targets

- **Development:** Local machine (`npm run dev:all`)
- **Staging:** Docker container (testing before production)
- **Production:** [Your platform] (live users)

## Performance Targets

| Metric | Target | Current |
|---|---|---|
| Quote generation | < 2 sec | ~1.5 sec ✅ |
| Document conversion | < 5 sec | ~4 sec ✅ |
| List 50K quotes | < 1 sec | Slow ⚠️ (needs indexes) |
| Upload large file | < 10 sec | ~15 sec ⚠️ |

## Known Issues / Debt

1. **Database Performance:** No indexes on frequently queried fields (userId, createdAt)
2. **File Upload:** No concurrent upload handling (bottleneck at 10+ files)
3. **Cloud Integration:** Partial (Egnyte works, SharePoint in progress)
4. **Error Messages:** Expose too much info (security risk)

## Next Priorities

1. Add MongoDB indexes (1 day) → 50x perf improvement
2. Implement file upload queuing (2 days) → handle 100+ files
3. Security audit before GA (1 day) → fix error messages
4. Cloud integration completion (3 days) → all platforms working

## How to Get Help

- **Code issues?** → `/review` or `@code-reviewer`
- **Need to test?** → `/qa` or `@qa-engineer`
- **Security question?** → `@security-reviewer`
- **Stuck on approach?** → `@research`
- **Deployment issue?** → `/deploy [target]`

---

**Last Updated:** June 29, 2026
**Updated By:** [Setup process]
**Review Frequency:** Weekly (update after major changes)
