# Multi-Combination Workflow - Step-by-Step Guide

## Overview
The Multi-Combination feature allows users to select and configure multiple migration types (Messaging, Content, Email) simultaneously, with the ability to add more exhibits after initial configuration and edit existing configurations.

---

## Complete Workflow Steps

### **STEP 1: Select Migration Type**
1. User navigates to the Configuration Form
2. User selects **"Multi combination"** from the Migration Type dropdown
3. The ExhibitSelector component appears below

---

### **STEP 2: Select Initial Exhibits**
1. **ExhibitSelector displays:**
   - All available exhibits in a unified list (Messaging, Content, and Email combined)
   - Search bar at the top to filter exhibits by name
   - "Show Selected Only" toggle button to view only selected exhibits

2. **User actions:**
   - User can search for exhibits by typing in the search bar
   - User clicks on exhibit cards to select/deselect them
   - Selected exhibits show a checkmark and highlighted border
   - User can select multiple exhibits from different categories

3. **After selection:**
   - User clicks **"Continue to Configuration"** button
   - The ExhibitSelector hides
   - Configuration sections appear for selected exhibits

---

### **STEP 3: Configure Selected Exhibits**
1. **Configuration sections appear based on selected exhibit categories:**
   - **Messaging Configuration:** If any Messaging exhibits are selected
   - **Content Configuration:** If any Content exhibits are selected
   - **Email Configuration:** If any Email exhibits are selected

2. **Each exhibit gets its own configuration card with fields:**
   - **Messaging Exhibits:**
     - Number of Users
     - Instance Type (dropdown)
     - Number of Instances
     - Duration (months)
     - Number of Messages
   
   - **Content Exhibits:**
     - Number of Users
     - Instance Type (dropdown)
     - Number of Instances
     - Duration (months)
     - Data Size (GB)
   
   - **Email Exhibits:**
     - Number of Users
     - Instance Type (dropdown)
     - Number of Instances
     - Duration (months)
     - Number of Emails (optional)

3. **User fills in configuration values for each selected exhibit**

4. **User clicks "Calculate Pricing" button**
   - Pricing is calculated for all configured exhibits
   - PricingComparison component displays the results
   - Configuration sections are hidden (to keep UI clean)
   - "Add More Exhibits" and "Edit Configuration" buttons appear

---

### **STEP 4: View Pricing Results**
1. **PricingComparison shows:**
   - Three pricing tiers (Basic, Standard, Premium) side by side
   - Total cost breakdown for each tier
   - Individual breakdowns for Messaging, Content, and Email sections
   - Per-combination pricing details

2. **User can:**
   - Compare pricing across tiers
   - Select a tier by clicking on it
   - View detailed cost breakdowns

---

### **STEP 5: Add More Exhibits (Optional)**
1. **User clicks "Add More Exhibits" button**
   - ExhibitSelector appears again
   - Previously selected exhibits remain selected (can be seen if "Show Selected Only" is toggled)

2. **User selects additional exhibits:**
   - Can search for new exhibits
   - Can select new exhibits from any category
   - Previously selected exhibits remain selected

3. **User clicks "Continue to Configuration"**
   - ExhibitSelector hides
   - **ONLY the newly added exhibits' configuration sections appear**
   - Previously configured exhibits' sections remain hidden

4. **User fills configuration for new exhibits**

5. **User clicks "Calculate Pricing"**
   - Pricing recalculates including all exhibits (old + new)
   - Configuration sections hide again
   - Updated pricing is displayed

---

### **STEP 6: Edit Existing Configuration (Optional)**
1. **User clicks "Edit Configuration" button**
   - All configuration sections appear (for all selected exhibits)
   - User can see and edit previously configured exhibits

2. **User modifies configuration values:**
   - Can change any field for any exhibit
   - Can update users, instances, duration, data size, messages, etc.

3. **User clicks "Calculate Pricing"**
   - Pricing recalculates with updated values
   - Configuration sections hide
   - Updated pricing is displayed

---

## Key Features & Behaviors

### **Smart Configuration Visibility**
- **When adding new exhibits:** Only newly added exhibits' configurations are shown
- **When editing:** All configurations are shown for editing
- **After pricing calculation:** All configurations are hidden to keep UI clean

### **Exhibit Selection**
- **Unified list:** All exhibits (Messaging, Content, Email) in one scrollable list
- **Search functionality:** Filter exhibits by name in real-time
- **Show Selected Only:** Toggle to view only selected exhibits
- **Multi-select:** Select multiple exhibits from different categories

### **State Management**
- **Previously Configured Exhibits:** System tracks which exhibits have been configured
- **Adding More Mode:** When `isAddingMoreExhibits` is true, only new exhibits show configuration
- **Edit Mode:** When `showEditConfiguration` is true, all configurations are visible

### **Pricing Calculation**
- **Per-exhibit pricing:** Each exhibit is calculated separately
- **Combined totals:** All exhibit costs are summed for final pricing
- **Tier comparison:** Three pricing tiers are calculated and displayed
- **Category breakdowns:** Separate calculations for Messaging, Content, and Email

---

## User Flow Diagram

```
START
  ↓
Select "Multi combination"
  ↓
ExhibitSelector appears
  ↓
Search & Select Exhibits
  ↓
Click "Continue to Configuration"
  ↓
Configuration Sections Appear
  ↓
Fill Configuration Values
  ↓
Click "Calculate Pricing"
  ↓
Pricing Results Displayed
  ↓
[OPTION A: Add More Exhibits]
  ├─ Click "Add More Exhibits"
  ├─ Select New Exhibits
  ├─ Click "Continue to Configuration"
  ├─ Only NEW Exhibits' Config Shown
  ├─ Fill Configuration
  └─ Click "Calculate Pricing" → Back to Pricing Results
  ↓
[OPTION B: Edit Configuration]
  ├─ Click "Edit Configuration"
  ├─ All Configurations Shown
  ├─ Edit Values
  └─ Click "Calculate Pricing" → Back to Pricing Results
  ↓
[OPTION C: Continue to Quote]
  └─ Generate Quote/Agreement
```

---

## Technical Implementation Details

### **State Variables (ConfigurationForm.tsx)**
- `showAddMoreExhibits`: Controls ExhibitSelector visibility when adding more
- `hasConfiguredExhibits`: Tracks if initial configuration is complete
- `isAddingMoreExhibits`: Tracks if user is adding new exhibits (hides old configs)
- `showEditConfiguration`: Tracks if user is editing (shows all configs)
- `previouslyConfiguredExhibits`: Set of exhibit IDs that have been configured

### **Conditional Rendering Logic**
```typescript
// ExhibitSelector shows when:
config.migrationType === 'Multi combination' && 
(!hasConfiguredExhibits || showAddMoreExhibits)

// Configuration sections show when:
config.migrationType === 'Multi combination' && 
hasConfiguredExhibits && 
selectedExhibits.length > 0 && 
(!showPricing || isAddingMoreExhibits || showEditConfiguration)

// Individual exhibit config hides when:
isAddingMoreExhibits && previouslyConfiguredExhibits.has(exhibitId)
```

### **Pricing Calculation (pricing.ts)**
- Each exhibit category (Messaging, Content, Email) is calculated separately
- Results are combined: `totalCost = messagingTotal + contentTotal + emailTotal`
- Per-combination breakdowns are stored for detailed display

---

## Example Scenarios

### **Scenario 1: Basic Multi-Combination**
1. Select "Multi combination"
2. Select "Slack to Teams" (Messaging) and "OneDrive to OneDrive" (Content)
3. Configure: 10 users each, 1 instance, 12 months
4. Calculate pricing → See combined pricing

### **Scenario 2: Adding More Exhibits**
1. After initial pricing, click "Add More Exhibits"
2. Select "Gmail to Outlook" (Email)
3. Only Gmail configuration appears (Slack and OneDrive configs hidden)
4. Configure: 5 users, 1 instance, 6 months
5. Calculate pricing → See updated pricing with all 3 exhibits

### **Scenario 3: Editing Configuration**
1. After pricing, click "Edit Configuration"
2. All 3 exhibits' configurations appear
3. Change Slack users from 10 to 15
4. Calculate pricing → See updated pricing

---

## Notes
- Configuration data is stored in session storage for persistence
- Users can navigate away and return without losing their configuration
- The system automatically detects exhibit categories and shows appropriate configuration fields
- Pricing calculations are tier-based and can be compared across three pricing plans

