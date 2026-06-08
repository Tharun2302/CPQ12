# New vs Existing Combination: Which Should You Choose?

## 🎯 The Logic

```
Do you already have Include exhibits for this combination?
        │
        ├─ YES → Add to EXISTING folder
        │        (Just upload NotInclude)
        │
        └─ NO → Create NEW folder
                (Upload both Include & NotInclude)
```

---

## 🔍 How to Know If Combination Already Exists

### Method 1: Check in Exhibit Selector
```
1. Go to: Create Quote → Configure → Select Combination
2. Look at the dropdown list
3. Search for your combination name

If you see it:
  ✅ COMBINATION ALREADY EXISTS
  → Use "Add to existing folder"

If you don't see it:
  ❌ COMBINATION DOESN'T EXIST
  → Use "Create new folder"
```

### Method 2: Check in Exhibit Manager
```
1. Go to: Exhibit Manager (Manage migration exhibits)
2. Look at the exhibit list
3. Search for exhibits with your combination name

If you see exhibits with that name:
  ✅ COMBINATION ALREADY EXISTS
  → Use "Add to existing folder"

If you don't see any:
  ❌ COMBINATION DOESN'T EXIST
  → Use "Create new folder"
```

---

## 📊 Two Scenarios

### Scenario A: Combination ALREADY EXISTS ✅

**Example**: You already have "Slack to Teams" with:
```
✓ Standard Include
✓ Standard Not Include
```

Now you want to add:
```
+ Basic Include
+ Basic Not Include
```

#### What to Do:
```
Upload 1: Basic Include
  Combination: ☐ Create new folder
              ☑ Use existing: "Slack to Teams"
  Plan: basic
  Include: ☑ Included
  [Upload]

Upload 2: Basic Not Include
  Combination: ☐ Create new folder
              ☑ Use existing: "Slack to Teams"  ← SAME!
  Plan: basic
  Include: ☑ Not Included
  [Upload]
```

#### Result in Database:
```javascript
// Exhibit 1 (Standard Include) - ALREADY EXISTED
{
  combinations: ["slack-to-teams"],
  planType: "standard",
  includeType: "included"
}

// Exhibit 2 (Standard Not Include) - ALREADY EXISTED
{
  combinations: ["slack-to-teams"],
  planType: "standard",
  includeType: "notincluded"
}

// NEW Exhibit 3 (Basic Include)
{
  combinations: ["slack-to-teams"],    // ← SAME GROUP!
  planType: "basic",
  includeType: "included"
}

// NEW Exhibit 4 (Basic Not Include)
{
  combinations: ["slack-to-teams"],    // ← SAME GROUP!
  planType: "basic",
  includeType: "notincluded"
}
```

#### Result in Exhibit Selector:
```
📁 Slack to Teams (4 files)        ← ALL IN ONE GROUP!
   ☐ Standard Include
   ☐ Standard Not Include
   ☐ Basic Include
   ☐ Basic Not Include
```

✅ **All grouped together in ONE folder!**

---

### Scenario B: Combination DOESN'T EXIST ❌

**Example**: You have a brand new combination called "New Combo"
```
It doesn't exist yet in the system
```

Now you want to create:
```
+ Basic Include
+ Basic Not Include
```

#### What to Do:
```
Upload 1: Basic Include
  Combination: ☑ Create new folder
  New folder name: "new combo"
  Plan: basic
  Include: ☑ Included
  [Upload]

Upload 2: Basic Not Include
  Combination: ☑ Create new folder
  New folder name: "new combo"        ← SAME NAME!
  Plan: basic
  Include: ☑ Not Included
  [Upload]
```

#### Result in Database:
```javascript
// Exhibit 1 (Basic Include)
{
  combinations: ["new-combo"],         // ← NEW!
  planType: "basic",
  includeType: "included"
}

// Exhibit 2 (Basic Not Include)
{
  combinations: ["new-combo"],         // ← SAME GROUP!
  planType: "basic",
  includeType: "notincluded"
}
```

#### Result in Exhibit Selector:
```
📁 New Combo (2 files)             ← NEW GROUP!
   ☐ Basic Include
   ☐ Basic Not Include
```

✅ **New combination created with grouped exhibits!**

---

## 🔑 The Critical Logic

### KEY RULE #1: Same Combination Name = Same Group

```
If both uploads use combination: "slack-to-teams"
   → They WILL group together ✅

If uploads use: "slack-to-teams" and "slack to teams"
   → They WON'T group together ❌
```

### KEY RULE #2: Check Exhibit Manager First!

**BEFORE uploading**, check:
1. Does this combination already have any exhibits?
2. If YES → Add to existing folder
3. If NO → Create new folder

**Never guess!** Always verify first.

---

## 📋 Decision Tree

```
"I want to add Include & NotInclude for [combination]"
        │
        ▼
Does this combination already exist in the system?
(Check Exhibit Manager or Selector)
        │
        ├─ YES ────────────────────────────────────┐
        │                                          │
        │  ✅ Use EXISTING Folder                 │
        │     Upload 1: Existing folder + Include │
        │     Upload 2: Existing folder + NotIncl │
        │     Result: All group together ✅       │
        │                                          │
        ├─ NO ─────────────────────────────────────┐
        │                                          │
        │  ✅ Create NEW Folder                   │
        │     Upload 1: New folder + Include      │
        │     Upload 2: New folder + NotIncl      │
        │     Result: Creates new group ✅       │
        │                                          │
        └──────────────────────────────────────────┘
```

---

## 👀 Visual Examples

### Example 1: Adding to EXISTING

```
BEFORE:
  📁 Slack to Teams
     ✓ Standard Include
     ✓ Standard Not Include

YOU UPLOAD:
  Upload 1: Slack to Teams + Basic + Include
  Upload 2: Slack to Teams + Basic + NotInclude

AFTER:
  📁 Slack to Teams              ✅ SAME FOLDER!
     ✓ Standard Include
     ✓ Standard Not Include
     + Basic Include             ← NEW
     + Basic Not Include         ← NEW
```

### Example 2: Creating NEW

```
BEFORE:
  (Nothing exists)

YOU UPLOAD:
  Upload 1: New Combo + Basic + Include
  Upload 2: New Combo + Basic + NotInclude

AFTER:
  📁 New Combo                   ✅ NEW FOLDER!
     + Basic Include
     + Basic NotInclude
```

---

## ⚠️ Critical Mistakes

### ❌ Mistake 1: Using Different Folder Names

```
Upload 1: Combination "slack-to-teams"
Upload 2: Combination "Slack to Teams"  ← Different!

Result:
  📁 slack-to-teams
     ☐ Include
  📁 Slack to Teams
     ☐ NotInclude

❌ They're split across TWO folders!
   Not grouped together!
```

### ❌ Mistake 2: Creating New When Should Add to Existing

```
EXISTING:
  📁 Slack to Teams
     ✓ Standard Include
     ✓ Standard Not Include

YOU UPLOAD:
  Upload 1: ☑ Create new folder: "Slack to Teams"
  Upload 2: ☑ Create new folder: "Slack to Teams"

Result:
  📁 Slack to Teams (original)
     ✓ Standard Include
     ✓ Standard Not Include
  
  📁 Slack to Teams (duplicate!)
     + Basic Include
     + Basic NotInclude

❌ DUPLICATED! Now there are TWO folders
   with the same name!
```

### ✅ Correct Way (Continue Existing):

```
Upload 1: ☐ Create new
          ☑ Use existing: "Slack to Teams"
          
Upload 2: ☐ Create new
          ☑ Use existing: "Slack to Teams"

Result:
  📁 Slack to Teams (ONE folder)
     ✓ Standard Include
     ✓ Standard Not Include
     ✓ Basic Include
     ✓ Basic NotInclude

✅ Everything grouped together!
```

---

## 🔄 Your Specific Scenario

You said: "I am adding Include and NotInclude for same combination"

**Questions to ask yourself**:

1. **Does this combination already exist?**
   - Check Exhibit Manager
   - Check Exhibit Selector dropdown
   - If YES → Use Existing Folder
   - If NO → Create New Folder

2. **Are both Include and NotInclude for the same plan?**
   - Same plan (e.g., "basic")
   - Different includeType ("included" vs "notincluded")
   - ✅ YES → This is correct!

3. **Are both using the same combination name?**
   - First upload: "new combination"
   - Second upload: "new combination" ← MUST be identical
   - ✅ YES → They will group!

---

## 📝 Step-by-Step Decision

### If Combination Already Exists:

```
1. Open Exhibit Manager
2. Click "Upload Exhibit"
3. Select file (Include version)
4. Select Category
5. Choose Combination:
   ☐ Create new folder
   ☑ Use existing folder: [Select dropdown]
   → Find your combination name
6. Select Plan Type: basic
7. Select Include Type: ☑ Included
8. [Upload Exhibit]

9. Repeat steps 2-8 for NotInclude version
   But change:
   - File (NotInclude version)
   - Include Type: ☑ Not Included
```

### If Combination Doesn't Exist:

```
1. Open Exhibit Manager
2. Click "Upload Exhibit"
3. Select file (Include version)
4. Select Category
5. Choose Combination:
   ☑ Create new folder
   [Text Input] new combination
6. Select Plan Type: basic
7. Select Include Type: ☑ Included
8. [Upload Exhibit]

9. Repeat steps 2-8 for NotInclude version
   But change:
   - File (NotInclude version)
   - Include Type: ☑ Not Included
   
   IMPORTANT: Use the SAME folder name!
   [Text Input] new combination  ← Must match!
```

---

## ✅ Verification Checklist

After uploading both exhibits, verify:

```
☑ Both use same combination name
☑ Both use same plan type
☑ One is "included", one is "notincluded"
☑ Different files (Include vs NotInclude content)
☑ In Exhibit Selector, they appear in ONE group
☑ In Exhibit Manager, they list under same combination
☑ Can select both in the same folder
```

If all checked ✅ → **You're done!**

---

## 🎯 Summary

| Situation | What to Do |
|-----------|-----------|
| Combination already exists | ☑ Use existing folder |
| Combination is brand new | ☑ Create new folder |
| Adding both Include & NotInclude | Use SAME name for both |
| Different plan levels | Still same combination if same migration |
| Want them grouped together | MUST use exact same combination name |

---

## 💡 The Golden Rule

### **If combination exists** → Add to it
### **If combination doesn't exist** → Create it
### **For both** → Use exact same name!

This ensures Include and NotInclude exhibits are **always grouped together** ✅
