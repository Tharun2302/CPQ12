# Workflow: Add New Combination with Include & NotInclude

## 📋 Scenario

**Goal**: Add a new combination  
**Name**: "new combination"  
**Plan**: Basic  
**Variants**: Include + Not Include

---

## ✅ Complete Workflow

### **Phase 1: Preparation**

#### Step 1.1: Create DOCX Files
Create two Word documents (.docx format):

```
File 1: new-combination-basic-include.docx
├─ Content describing features INCLUDED in basic plan
├─ For the "new combination" migration
└─ Name should be descriptive

File 2: new-combination-basic-notinclude.docx
├─ Content describing features NOT included in basic plan
├─ For the "new combination" migration
└─ Name should be descriptive
```

**Example filenames**:
```
✓ new-combination-basic-included.docx
✓ new-combination-basic-notincluded.docx
✓ newcombination-basic-include.docx
✓ source-to-destination-basic-include.docx
```

#### Step 1.2: Gather Information
Before uploading, know:
```
Combination: "new combination" or "source-to-destination"
Category: messaging / content / email
Plan Type: basic (for this example)
Display Order: (priority in list, default 999)
Keywords: tags for searching
Is Required: yes/no
```

---

### **Phase 2: Upload First Exhibit (Include)**

#### Step 2.1: Navigate to Exhibit Manager
```
URL: https://zenop.ai/exhibits
Or: Left menu → Exhibits → "Upload Exhibit" button
```

#### Step 2.2: Fill Upload Form

```
┌──────────────────────────────────────────┐
│        UPLOAD EXHIBIT FORM                │
├──────────────────────────────────────────┤
│                                          │
│ 📄 FILE SELECTION                        │
│ [Select File] new-combination-basic-     │
│              include.docx                │
│                                          │
│ 📂 CATEGORY                              │
│ [Select] ▼ content                       │
│          messaging                       │
│          email                           │
│                                          │
│ 📍 COMBINATION/FOLDER                    │
│ [Dropdown/Text] ▼                        │
│ ☐ Use predefined                         │
│ ☑ Create new folder                      │
│ [Text Input] new combination             │
│                                          │
│ 📋 PLAN TYPE (Required!)                 │
│ ☐ Basic   ← SELECT THIS                  │
│ ☐ Standard                               │
│ ☐ Advanced                               │
│                                          │
│ ✓ INCLUDE/NOT INCLUDE (Required!)        │
│ ☑ Included Features ← SELECT THIS        │
│ ☐ Not Included Features                  │
│                                          │
│ 🔢 DISPLAY ORDER                         │
│ [Text] 1                                 │
│        (Or leave default 999)            │
│                                          │
│ 🏷️  KEYWORDS                              │
│ [Text] new, combination, basic,included  │
│        (Comma-separated)                 │
│                                          │
│ ⚙️  OPTIONS                               │
│ ☐ Mark as Required                       │
│                                          │
│              [Upload Exhibit]            │
└──────────────────────────────────────────┘
```

#### Step 2.3: Click Upload Exhibit

**What happens**:
```
Frontend:
  1. Validate form inputs
  2. buildCombinationKey("new combination", "included", "basic")
     → Returns: "new-combination"  ✅
  3. Generate name: "New Combination Basic Plan - Basic Include"
  4. Send FormData to backend

Backend:
  1. Auth check ✓
  2. File validation ✓
  3. Metadata validation ✓
  4. Duplicate check ✓
  5. Create document:
     {
       name: "New Combination Basic Plan - Basic Include",
       fileName: "new-combination-basic-include.docx",
       fileData: <base64>,
       category: "content",
       combinations: ["new-combination"],  ← KEY!
       planType: "basic",                  ← Separate
       includeType: "included",            ← Separate
       displayOrder: 1,
       keywords: ["new", "combination", "basic", "included"],
       isRequired: false,
       createdAt: now,
       updatedAt: now
     }
  6. Save to MongoDB ✓
  7. Save to /backend-exhibits/ ✓
  8. Return success

Frontend:
  1. Show "Exhibit uploaded successfully!"
  2. Refresh exhibit list
  3. Close modal
```

**Result**:
```
✅ Exhibit 1 Created
   Name: "New Combination Basic Plan - Basic Include"
   Combination: "new-combination"
   PlanType: "basic"
   IncludeType: "included"
```

---

### **Phase 3: Upload Second Exhibit (Not Include)**

#### Step 3.1: Upload Form Again

```
Repeat the form, but change:

FILE: new-combination-basic-notinclude.docx

COMBINATION: "new combination"  ← SAME AS BEFORE!

PLAN TYPE: Basic  ← SAME AS BEFORE!

✓ INCLUDE/NOT INCLUDE:
  ☐ Included Features
  ☑ Not Included Features  ← CHANGE THIS!

KEYWORDS: new, combination, basic, notincluded
         (Updated to reflect NotInclude)

[Upload Exhibit]
```

#### Step 3.2: Click Upload Exhibit

**What happens**:
```
Frontend:
  1. Validate form inputs
  2. buildCombinationKey("new combination", "notincluded", "basic")
     → Returns: "new-combination"  ✅ SAME KEY!
  3. Generate name: "New Combination Basic Plan - Basic Not Include"
  4. Send FormData to backend

Backend:
  1. Auth check ✓
  2. File validation ✓
  3. Metadata validation ✓
  4. Duplicate check ✓
  5. Create document:
     {
       name: "New Combination Basic Plan - Basic Not Include",
       fileName: "new-combination-basic-notinclude.docx",
       fileData: <base64>,
       category: "content",
       combinations: ["new-combination"],  ← SAME KEY!
       planType: "basic",                  ← Same plan
       includeType: "notincluded",         ← Different include!
       displayOrder: 2,
       keywords: ["new", "combination", "basic", "notincluded"],
       isRequired: false,
       createdAt: now,
       updatedAt: now
     }
  6. Save to MongoDB ✓
  7. Save to /backend-exhibits/ ✓
  8. Return success
```

**Result**:
```
✅ Exhibit 2 Created
   Name: "New Combination Basic Plan - Basic Not Include"
   Combination: "new-combination"
   PlanType: "basic"
   IncludeType: "notincluded"
```

---

### **Phase 4: Verify Grouping**

#### Step 4.1: Open Exhibit Selector
```
Go to: Create Quote → Configure → Exhibits
Or: Click on Combination dropdown
```

#### Step 4.2: Check Grouping

**What you should see**:

```
Exhibit Selector Interface:

📁 New Combination (2 files)
   ☐ Basic Include
   ☐ Basic Not Include

OR if you expand it:
   
📁 New Combination (2 files)
   ├─ Basic Include
   │  (4 files in group)
   └─ Basic Not Include
      (4 files in group)
```

✅ **SUCCESS**: Both exhibits are grouped under "New Combination"!

---

## 📊 Data Structure Created

### In MongoDB

```javascript
Exhibit 1:
{
  _id: ObjectId("...1"),
  name: "New Combination Basic Plan - Basic Include",
  fileName: "new-combination-basic-include.docx",
  category: "content",
  combinations: ["new-combination"],     // ← SAME
  planType: "basic",                     // ← SAME
  includeType: "included",               // ← DIFFERENT
  displayOrder: 1,
  keywords: [...],
  isRequired: false,
  createdAt: "2026-06-05T10:00:00Z",
  updatedAt: "2026-06-05T10:00:00Z"
}

Exhibit 2:
{
  _id: ObjectId("...2"),
  name: "New Combination Basic Plan - Basic Not Include",
  fileName: "new-combination-basic-notinclude.docx",
  category: "content",
  combinations: ["new-combination"],     // ← SAME ✅
  planType: "basic",                     // ← SAME ✅
  includeType: "notincluded",            // ← DIFFERENT ✅
  displayOrder: 2,
  keywords: [...],
  isRequired: false,
  createdAt: "2026-06-05T10:05:00Z",
  updatedAt: "2026-06-05T10:05:00Z"
}
```

### Grouping Logic

```javascript
// When selector loads, it groups by combinations[0]
const groups = {
  "new-combination": [
    { name: "New Combination Basic Plan - Basic Include", includeType: "included" },
    { name: "New Combination Basic Plan - Basic Not Include", includeType: "notincluded" }
  ]
}

// Both have SAME combination key
// So they appear in ONE group ✅
```

---

## 🔄 Complete Visual Flow

```
┌─────────────────────────────────────────────────────────┐
│        UPLOAD EXHIBIT 1 (INCLUDE)                       │
├─────────────────────────────────────────────────────────┤
│ File: new-combination-basic-include.docx                │
│ Combination: "new combination"                          │
│ Plan: basic                                             │
│ Include Type: included ← KEY SELECTION 1                │
│ [Upload]                                                │
└──────────────────────────┬──────────────────────────────┘
                           │
                    ✅ Uploaded
                           │
              buildCombinationKey()
              ("new combination", "included", "basic")
              → "new-combination"
                           │
            Stored in MongoDB with:
              combinations: ["new-combination"]
              includeType: "included"
                           │
┌──────────────────────────────────────────────────────────┐
│        UPLOAD EXHIBIT 2 (NOT INCLUDE)                    │
├──────────────────────────────────────────────────────────┤
│ File: new-combination-basic-notinclude.docx             │
│ Combination: "new combination" ← SAME                    │
│ Plan: basic ← SAME                                      │
│ Include Type: not included ← KEY SELECTION 2            │
│ [Upload]                                                 │
└──────────────────────────┬───────────────────────────────┘
                           │
                    ✅ Uploaded
                           │
              buildCombinationKey()
              ("new combination", "notincluded", "basic")
              → "new-combination" ← SAME KEY!
                           │
            Stored in MongoDB with:
              combinations: ["new-combination"]
              includeType: "notincluded"
                           │
                 Both have SAME combination!
                           │
┌──────────────────────────────────────────────────────────┐
│          EXHIBIT SELECTOR GROUPS THEM                    │
├──────────────────────────────────────────────────────────┤
│ 📁 New Combination (2 files)                             │
│    ☐ Basic Include                                      │
│    ☐ Basic Not Include                                  │
│                                                          │
│ ✅ GROUPED TOGETHER!                                    │
└──────────────────────────────────────────────────────────┘
```

---

## 💡 Key Points to Remember

| Step | What | Why | Example |
|------|------|-----|---------|
| **1** | Create combo name | For grouping | "new combination" |
| **2** | Upload Include basic | Variant 1 | Include file |
| **3** | Upload NotInclude basic | Variant 2 | NotInclude file |
| **4** | Use SAME combination | So they group! | "new-combination" |
| **5** | Use SAME plan | So they group! | "basic" |
| **6** | Use DIFFERENT include type | Distinguish them | "included" vs "notincluded" |
| **7** | Verify in selector | See grouped | Should see 2 files in 1 group |

---

## ✨ What Makes Them Group Together?

```javascript
// Exhibit 1 (Include)
combinations: ["new-combination"]
planType: "basic"
includeType: "included"

// Exhibit 2 (Not Include)
combinations: ["new-combination"]
planType: "basic"
includeType: "notincluded"

// GROUPING LOGIC
Group exhibits by: combinations[0]
Result: Both have "new-combination"
        So they're in the SAME group ✅

// DIFFERENTIATION
Distinguish by: includeType
Result: One is "included", one is "notincluded"
        So they appear as separate items ✅
```

---

## ❌ Common Mistakes to Avoid

### Mistake 1: Different Combination Names
```javascript
Exhibit 1: combination: ["new-combination"]
Exhibit 2: combination: ["new combination"]  ← DIFFERENT!

Result: Won't group ❌
Solution: Use exact same name ✓
```

### Mistake 2: Forgetting to Set Include Type
```javascript
Both exhibits:
  includeType: "" (empty) ← BOTH SAME!

Result: Indistinguishable ❌
Solution: Set one to "included", one to "notincluded" ✓
```

### Mistake 3: Using Different Plans
```javascript
Exhibit 1: planType: "basic"
Exhibit 2: planType: "standard"  ← DIFFERENT!

Result: Will they group?
  Still group by combination ✓
  But different plan sections might display separately
Solution: If you want them together, use same plan ✓
```

### Mistake 4: Wrong File Format
```javascript
File: new-combination-basic.txt  ← NOT .docx!

Result: Upload fails ❌
Solution: Save as .docx (Word document) ✓
```

---

## 🎯 Summary: The Workflow

```
1. CREATE FILES
   new-combination-basic-include.docx
   new-combination-basic-notinclude.docx

2. UPLOAD #1 (Include)
   Form:
     Combination: "new combination"
     Plan: basic
     Include Type: ✓ Included
   Result: 
     combinations: ["new-combination"]
     includeType: "included"

3. UPLOAD #2 (Not Include)
   Form:
     Combination: "new combination"  ← SAME!
     Plan: basic                     ← SAME!
     Include Type: ☑ Not Included
   Result:
     combinations: ["new-combination"]  ← SAME! ✅
     includeType: "notincluded"

4. VERIFY
   Open Exhibit Selector
   Should see:
     📁 New Combination (2 files)
        ☐ Basic Include
        ☐ Basic Not Include

✅ COMPLETE!
```

---

## 🔧 Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Not grouping together | Different combination names | Check spelling and use same name |
| Both appear identical | Both same includeType | Set one to "included", one to "notincluded" |
| Upload fails | Wrong file type | Use .docx format only |
| Upload fails | Missing plan type | Select Basic, Standard, or Advanced |
| Upload fails | Missing include type | Select Included or Not Included |
| Can't find in selector | Different category selected | Check category matches (messaging/content/email) |

---

## 📞 Need Help?

When adding a new combination, remember:
1. ✅ SAME combination name → Groups together
2. ✅ DIFFERENT includeType → Shows as separate items
3. ✅ SAME planType → Same plan section
4. ✅ Different files → Different content

The key is: **Same combination = Same group** ✅
