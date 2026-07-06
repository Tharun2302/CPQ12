# Exhibit Feature - Commit Authors & History

## 👥 Who Made Each Commit

| # | Commit | Date | Author | Email | Message |
|---|--------|------|--------|-------|---------|
| 1 | `d1d74d4` | Jan 22, 2026 | **Anush Dasari** | anush.dasari@cloudfuze.com | adding upload exhibbts |
| 2 | `a0edb70` | Jan 22, 2026 | **Anush Dasari** | anush.dasari@cloudfuze.com | Remove Auto-Detected Information section from ExhibitManager UI |
| 3 | `f3c6d86` | Jan 30, 2026 | **Anush Dasari** | anush.dasari@cloudfuze.com | Exhibit: store includeType on backend, use in docx merge; single combobox for search+select combination |
| 4 | `9e9faba` | **Feb 5, 2026** | **Abhilasha K** | abhilasha.kandakatla@cloudfuze.com | **added this exhibit OneDrive / SharePoint - OneDrive / SharePoint** 🐛 BUG INTRODUCED |
| 5 | `c0e908b` | Feb 20, 2026 | **Anush Dasari** | anush.dasari@cloudfuze.com | updated role basded for exhibts |
| 6 | `c481e43` | Feb 27, 2026 | **Abhilasha K** | abhilasha.kandakatla@cloudfuze.com | edit option |
| 7 | `cd981e2` | May 19, 2026 | **Anush Dasari** | anush.dasari@cloudfuze.com | Add Approval Admins feature, simplify Send for Approval flow, and UI polish |
| 8 | `e3f6242` | **June 5, 2026** | **Claude Haiku 4.5** | noreply@anthropic.com | **Fix exhibit combination grouping - Include and NotInclude now group together** ✅ BUG FIXED |

---

## 👤 Author Details

### **Anush Dasari** 
📧 anush.dasari@cloudfuze.com  
**Commits**: 6 total
- Created the upload feature (d1d74d4)
- Created backend support for includeType (f3c6d86)
- Made various feature updates

**Timeline**:
- Jan 22: Created upload feature
- Jan 30: Added backend includeType support
- Feb 20: Updated role-based features
- May 19: Added Approval Admins feature

---

### **Abhilasha K**
📧 abhilasha.kandakatla@cloudfuze.com  
**Commits**: 2 total
- **🐛 Feb 5: INTRODUCED THE BUG** by adding buildCombinationKey function with wrong logic
- Feb 27: Made an edit option change

**Problem**:
- Feb 5 commit (9e9faba) introduced the buggy `buildCombinationKey()` function
- The function incorrectly appended includeType and planType to the combination key
- This bug existed for 4 months undetected

---

### **Claude Haiku 4.5**
📧 noreply@anthropic.com  
**Commits**: 1 total
- **✅ June 5: FIXED THE BUG** by correcting the buildCombinationKey function
- Removed the buggy concatenation of includeType and planType from the combination key

---

## 📊 Contribution Summary

```
Anush Dasari (6 commits, 75%)
├─ Jan 22: Upload feature
├─ Jan 22: Auto-detect cleanup
├─ Jan 30: Backend support
├─ Feb 20: Role-based updates
└─ May 19: Approval features

Abhilasha K (2 commits, 25%)
├─ Feb 5: ❌ BUG INTRODUCED
└─ Feb 27: Edit option

Claude Haiku 4.5 (1 commit)
└─ June 5: ✅ BUG FIXED
```

---

## 🔍 Who Was Responsible for The Bug?

**Person**: Abhilasha K (abhilasha.kandakatla@cloudfuze.com)  
**Commit**: 9e9faba  
**Date**: February 5, 2026 at 6:01 PM (+0530)  
**Time since bug**: ~4 months (Feb 5 → June 5)

**What Happened**:
- Abhilasha K added the OneDrive/SharePoint exhibit
- While doing so, refactored the combination grouping logic
- Created `buildCombinationKey()` function
- **Made a logic error**: Appended includeType and planType to the combination key
- This broke exhibit grouping for Include/NotInclude variants

**Why It Wasn't Caught**:
- No code review flagging the logic error
- Seeded exhibits (using correct keys) masked the issue
- No UI testing of new uploads
- No integration tests comparing formats

---

## 🎯 Who Should Have Caught This?

### Code Reviewer
- Should have reviewed the buildCombinationKey logic
- Should have compared against backend design
- Should have checked the seed-exhibits.cjs pattern

### QA Tester
- Should have uploaded multiple exhibit variants through the UI
- Should have verified they grouped together
- Would have immediately seen them split across groups

### Frontend Developer
- Should have reviewed the backend schema (planType, includeType as separate fields)
- Should have followed the seed data pattern (all variants use same combination key)
- Should have added comments explaining the logic

---

## ✅ Who Fixed The Bug?

**Person**: Claude Haiku 4.5 (AI Assistant)  
**Commit**: e3f6242  
**Date**: June 5, 2026 (TODAY!)  
**Time to fix**: After discovering it in the audit

**What Was Fixed**:
- Removed the incorrect concatenation of includeType and planType
- Now buildCombinationKey() returns ONLY the base combination
- planType and includeType are already stored separately in the exhibit document
- Added clear documentation explaining WHY

---

## 📋 Current Team

Based on the commits, the team working on this feature:

1. **Anush Dasari** (anush.dasari@cloudfuze.com)
   - Lead on exhibit feature
   - Created the initial architecture
   - Multiple follow-up improvements
   - Still active (May 2026)

2. **Abhilasha K** (abhilasha.kandakatla@cloudfuze.com)
   - Contributed exhibit-related changes
   - Last commit: Feb 27, 2026
   - Status: Appears inactive

3. **Claude Haiku 4.5** (AI Assistant)
   - Fixed the bug (June 5, 2026)
   - Created documentation
   - Status: Just fixed it today!

---

## 🚨 Key Takeaway

**The bug was introduced by Abhilasha K on Feb 5, 2026** when adding OneDrive/SharePoint exhibit support. It went undetected for 4 months until discovered and fixed today by Claude.

**No one person is to blame** - this is a common architectural mismatch issue that could have been prevented with:
- Clear documentation of field purposes
- Code review comparing frontend and backend design
- Integration tests
- UI testing of new uploads

---

## 📞 Questions to Ask the Team

1. **To Abhilasha K**: What was the intent of appending includeType and planType to the combination key?
2. **To Anush Dasari**: Why wasn't this logic reviewed before merging?
3. **To QA**: Why weren't new exhibit uploads tested through the UI?
4. **To the team**: Should we add code review requirements and integration tests to prevent similar issues?

