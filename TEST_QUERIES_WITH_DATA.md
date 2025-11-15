# 🧪 Test Queries After Inserting Data

After running `insert-test-data.sql`, test these queries:

## 📊 Simple Queries (Should Work with Rule-Based)

1. **"How many deals done?"**
   - Expected: 6 (deals with status 'success')

2. **"Show me all client names"**
   - Expected: 10 clients

3. **"List all templates"**
   - Expected: 10 templates

4. **"What is the approval status?"**
   - Expected: List of all approvals

5. **"How many pending approvals?"**
   - Expected: 4 (pending approvals)

## 🎯 Complex Queries (Will Use LLM)

### Aggregations:
1. **"Show me the total number of deals grouped by status"**
   - Expected: success: 6, pending: 3, failed: 1

2. **"Count how many quotes were created in the last month"**
   - Expected: Count based on dates

3. **"What's the average number of quotes per client?"**
   - Expected: Calculation

### Joins:
4. **"Show me all quotes with their approval status"**
   - Expected: Quotes joined with signature_forms

5. **"List clients who have pending approvals"**
   - Expected: Clients with pending approval_status

6. **"Show deals with client company information"**
   - Expected: hubspot_integrations joined with quotes

### Date/Time:
7. **"Show me all quotes created this week"**
   - Expected: Quotes from recent dates

8. **"What deals were completed last month?"**
   - Expected: Deals from previous month

9. **"List templates created in the last 30 days"**
   - Expected: Recent templates

### Filtering:
10. **"Show me all approved agreements from last month"**
    - Expected: Approved signature_forms from previous month

11. **"List clients with rejected quotes"**
    - Expected: Quotes with status 'rejected'

12. **"Find all deals with status 'success' created after January 2025"**
    - Expected: Successful deals after Jan 2025

13. **"Show templates that are marked as default"**
    - Expected: Templates with is_default = true (1 template)

### Advanced:
14. **"What's the total count of quotes by status?"**
    - Expected: Grouped counts

15. **"List the top 5 clients by number of quotes"**
    - Expected: Top clients

16. **"Show me clients whose name contains 'Corp'"**
    - Expected: Acme Corporation, MegaCorp Industries

17. **"Find all quotes with their associated templates and approval status"**
    - Expected: Multi-table join

## 📈 Expected Results Summary

- **Templates**: 10 total (1 default)
- **Quotes**: 10 total
  - Status: 3 accepted, 3 sent, 2 viewed, 1 draft, 1 rejected
- **Deals**: 10 total
  - Status: 6 success, 3 pending, 1 failed
- **Approvals**: 10 total
  - Status: 4 approved, 1 rejected, 4 pending, 1 completed

## ✅ Success Criteria

After testing, you should see:
- ✅ Simple queries work instantly (rule-based)
- ✅ Complex queries generate SQL (LLM)
- ✅ Results match expected data
- ⚠️ Some complex queries might need fine-tuning

---

**Run the insert script first, then test these queries!** 🚀

