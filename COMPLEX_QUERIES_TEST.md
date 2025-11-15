# 🧪 Complex Queries to Test (Before Fine-Tuning)

Test these complex queries to see how well the **pretrained Llama model** handles them:

## 📊 Complex Query Examples

### 1. **Aggregations & Grouping**
- "Show me the total number of deals grouped by status"
- "What's the average cost per client?"
- "Count how many quotes were created in the last month"
- "Show me clients with more than 5 quotes"

### 2. **Joins & Relationships**
- "Show me all quotes with their approval status"
- "List clients who have pending approvals"
- "Show deals with client information"
- "Find quotes that have associated templates"

### 3. **Date/Time Queries**
- "Show me all quotes created this week"
- "What deals were completed last month?"
- "List templates created in the last 30 days"
- "Show pending approvals that expire soon"

### 4. **Filtering & Conditions**
- "Show me all approved agreements from last month"
- "List clients with rejected quotes"
- "Find all deals with status 'success' created after January 2025"
- "Show templates that are marked as default"

### 5. **Complex Aggregations**
- "What's the total revenue from all successful deals?"
- "Show me the count of quotes by status"
- "List the top 5 clients by number of quotes"
- "What's the average time between quote creation and approval?"

### 6. **Search & Pattern Matching**
- "Find all clients whose name contains 'Corp'"
- "Show me quotes for companies in the tech industry"
- "List templates with 'agreement' in the name"

### 7. **Multi-Table Queries**
- "Show me all client names with their deal status"
- "List quotes with their associated templates and approval status"
- "Find clients who have both quotes and pending approvals"

## 🎯 Test Strategy

1. **Start Simple**: Test basic queries first
2. **Increase Complexity**: Try harder queries
3. **Note Failures**: Which queries don't work?
4. **Document Issues**: What SQL errors occur?
5. **Prepare for Fine-Tuning**: Use failures as training data

## 📝 Expected Behavior

### ✅ Should Work (Rule-Based):
- "How many deals done?"
- "Show client names"
- "List templates"

### 🤔 Might Need LLM:
- "Show me clients with pending approvals from last week"
- "What's the total number of quotes grouped by status?"
- "List all deals with their client company names"

### ❌ Might Fail (Need Fine-Tuning):
- Very complex multi-table joins
- Advanced date calculations
- Custom business logic queries

## 🔍 How to Test

1. Go to SQL Agent tab
2. Try each query
3. Check if SQL is generated correctly
4. Check if results are accurate
5. Note any errors or wrong SQL

## 📊 What to Document

For each query, note:
- ✅ **Works perfectly** - SQL correct, results accurate
- ⚠️ **Works but wrong** - SQL generated but incorrect
- ❌ **Fails** - No SQL generated or error

This will help you prepare data for fine-tuning!

---

**Start testing and see how the pretrained model performs!** 🚀

