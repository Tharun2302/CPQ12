# Multi Combination Implementation - Separate Configuration Sections

## Summary
This document outlines the implementation of separate Messaging and Content configuration sections for Multi Combination migration type.

## Implementation Status

### ✅ Completed
1. **Type Definitions Updated** (`src/types/pricing.ts`)
   - Added `messagingConfig` and `contentConfig` to `ConfigurationData`
   - Added `messagingCalculation` and `contentCalculation` to `PricingCalculation`

### 🚧 In Progress - ConfigurationForm Changes

The following changes need to be made to `src/components/ConfigurationForm.tsx`:

#### 1. Add useEffect to track selected exhibit categories

```typescript
// Add this useEffect after the existing useEffects (around line 260)
useEffect(() => {
  const fetchExhibitsAndCategor

ize = async () => {
    if (config.migrationType !== 'Multi combination' || selectedExhibits.length === 0) {
      setSelectedExhibitCategories({ hasMessaging: false, hasContent: false, hasEmail: false });
      return;
    }

    try {
      // Fetch exhibit details from backend to get categories
      const response = await fetch(`${BACKEND_URL}/api/exhibits`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.exhibits) {
          const exhibits = data.exhibits;
          
          // Check which categories have selected exhibits
          let hasMessaging = false;
          let hasContent = false;
          let hasEmail = false;
          
          selectedExhibits.forEach(exhibitId => {
            const exhibit = exhibits.find((ex: any) => ex._id === exhibitId);
            if (exhibit) {
              const category = (exhibit.category || 'content').toLowerCase();
              if (category === 'messaging' || category === 'message') {
                hasMessaging = true;
              } else if (category === 'content') {
                hasContent = true;
              } else if (category === 'email') {
                hasEmail = true;
              }
            }
          });
          
          setSelectedExhibitCategories({ hasMessaging, hasContent, hasEmail });
          
          console.log('📊 Selected exhibit categories:', { hasMessaging, hasContent, hasEmail });
        }
      }
    } catch (error) {
      console.error('Error fetching exhibits:', error);
    }
  };

  fetchExhibitsAndCategor();
}, [config.migrationType, selectedExhibits]);
```

#### 2. Replace the single "Project Configuration" section (lines 1268-1517)

Replace the entire section from:
```typescript
{/* Other Configuration Fields - Conditional Rendering */}
{config.migrationType && (config.combination || config.migrationType === 'Multi combination') && (
  <div data-section="project-configuration" ...>
```

With two separate sections:

```typescript
{/* MESSAGING Project Configuration - Show only if Messaging exhibits selected */}
{config.migrationType === 'Multi combination' && selectedExhibitCategories.hasMessaging && (
  <div data-section="messaging-configuration" className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl shadow-2xl border border-teal-200 p-8 backdrop-blur-sm">
    <div className="text-center mb-8">
      <h3 className="text-2xl font-bold text-gray-900 mb-2">📱 Messaging Project Configuration</h3>
      <p className="text-gray-600">Configure your messaging migration requirements</p>
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Number of Users */}
      <div className="group">
        <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
            <Users className="w-4 h-4 text-white" />
          </div>
          Number of Users (Messaging)
        </label>
        <input
          type="number"
          min="0"
          value={config.messagingConfig?.numberOfUsers || ''}
          onChange={(e) => {
            const value = parseInt(e.target.value) || 0;
            setConfig(prev => ({
              ...prev,
              messagingConfig: {
                ...prev.messagingConfig,
                numberOfUsers: value,
                instanceType: prev.messagingConfig?.instanceType || 'Small',
                numberOfInstances: prev.messagingConfig?.numberOfInstances || 0,
                duration: prev.messagingConfig?.duration || 0,
                messages: prev.messagingConfig?.messages || 0
              }
            }));
          }}
          className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all duration-300 bg-white/80"
          placeholder="Enter number of users"
        />
      </div>

      {/* Instance Type */}
      <div className="group">
        <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
            <Server className="w-4 h-4 text-white" />
          </div>
          Instance Type (Messaging)
        </label>
        <select
          value={config.messagingConfig?.instanceType || 'Small'}
          onChange={(e) => {
            setConfig(prev => ({
              ...prev,
              messagingConfig: {
                ...prev.messagingConfig,
                numberOfUsers: prev.messagingConfig?.numberOfUsers || 0,
                instanceType: e.target.value as any,
                numberOfInstances: prev.messagingConfig?.numberOfInstances || 0,
                duration: prev.messagingConfig?.duration || 0,
                messages: prev.messagingConfig?.messages || 0
              }
            }));
          }}
          className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all duration-300 bg-white/80"
        >
          <option value="Small">Small</option>
          <option value="Standard">Standard</option>
          <option value="Large">Large</option>
          <option value="Extra Large">Extra Large</option>
        </select>
      </div>

      {/* Number of Instances */}
      <div className="group">
        <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Server className="w-4 h-4 text-white" />
          </div>
          Number of Instances (Messaging)
        </label>
        <input
          type="number"
          min="0"
          value={config.messagingConfig?.numberOfInstances || ''}
          onChange={(e) => {
            const value = parseInt(e.target.value) || 0;
            setConfig(prev => ({
              ...prev,
              messagingConfig: {
                ...prev.messagingConfig,
                numberOfUsers: prev.messagingConfig?.numberOfUsers || 0,
                instanceType: prev.messagingConfig?.instanceType || 'Small',
                numberOfInstances: value,
                duration: prev.messagingConfig?.duration || 0,
                messages: prev.messagingConfig?.messages || 0
              }
            }));
          }}
          className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all duration-300 bg-white/80"
          placeholder="Enter number of instances"
        />
      </div>

      {/* Duration */}
      <div className="group">
        <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center">
            <Clock className="w-4 h-4 text-white" />
          </div>
          Duration (Messaging)
        </label>
        <input
          type="number"
          min="1"
          value={config.messagingConfig?.duration || ''}
          onChange={(e) => {
            const value = parseInt(e.target.value) || 0;
            setConfig(prev => ({
              ...prev,
              messagingConfig: {
                ...prev.messagingConfig,
                numberOfUsers: prev.messagingConfig?.numberOfUsers || 0,
                instanceType: prev.messagingConfig?.instanceType || 'Small',
                numberOfInstances: prev.messagingConfig?.numberOfInstances || 0,
                duration: value,
                messages: prev.messagingConfig?.messages || 0
              }
            }));
          }}
          className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all duration-300 bg-white/80"
          placeholder="Enter duration in months"
        />
      </div>

      {/* Messages */}
      <div className="group md:col-span-2">
        <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          Messages
        </label>
        <input
          type="number"
          min="0"
          value={config.messagingConfig?.messages || ''}
          onChange={(e) => {
            const value = parseInt(e.target.value) || 0;
            setConfig(prev => ({
              ...prev,
              messagingConfig: {
                ...prev.messagingConfig,
                numberOfUsers: prev.messagingConfig?.numberOfUsers || 0,
                instanceType: prev.messagingConfig?.instanceType || 'Small',
                numberOfInstances: prev.messagingConfig?.numberOfInstances || 0,
                duration: prev.messagingConfig?.duration || 0,
                messages: value
              }
            }));
          }}
          className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all duration-300 bg-white/80"
          placeholder="Enter number of messages"
        />
      </div>
    </div>
  </div>
)}

{/* CONTENT Project Configuration - Show only if Content exhibits selected */}
{config.migrationType === 'Multi combination' && selectedExhibitCategories.hasContent && (
  <div data-section="content-configuration" className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl shadow-2xl border border-indigo-200 p-8 backdrop-blur-sm">
    <div className="text-center mb-8">
      <h3 className="text-2xl font-bold text-gray-900 mb-2">📁 Content Project Configuration</h3>
      <p className="text-gray-600">Configure your content migration requirements</p>
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Number of Users */}
      <div className="group">
        <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
            <Users className="w-4 h-4 text-white" />
          </div>
          Number of Users (Content)
        </label>
        <input
          type="number"
          min="0"
          value={config.contentConfig?.numberOfUsers || ''}
          onChange={(e) => {
            const value = parseInt(e.target.value) || 0;
            setConfig(prev => ({
              ...prev,
              contentConfig: {
                ...prev.contentConfig,
                numberOfUsers: value,
                instanceType: prev.contentConfig?.instanceType || 'Small',
                numberOfInstances: prev.contentConfig?.numberOfInstances || 0,
                duration: prev.contentConfig?.duration || 0,
                dataSizeGB: prev.contentConfig?.dataSizeGB || 0
              }
            }));
          }}
          className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-300 bg-white/80"
          placeholder="Enter number of users"
        />
      </div>

      {/* Instance Type */}
      <div className="group">
        <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
            <Server className="w-4 h-4 text-white" />
          </div>
          Instance Type (Content)
        </label>
        <select
          value={config.contentConfig?.instanceType || 'Small'}
          onChange={(e) => {
            setConfig(prev => ({
              ...prev,
              contentConfig: {
                ...prev.contentConfig,
                numberOfUsers: prev.contentConfig?.numberOfUsers || 0,
                instanceType: e.target.value as any,
                numberOfInstances: prev.contentConfig?.numberOfInstances || 0,
                duration: prev.contentConfig?.duration || 0,
                dataSizeGB: prev.contentConfig?.dataSizeGB || 0
              }
            }));
          }}
          className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-300 bg-white/80"
        >
          <option value="Small">Small</option>
          <option value="Standard">Standard</option>
          <option value="Large">Large</option>
          <option value="Extra Large">Extra Large</option>
        </select>
      </div>

      {/* Number of Instances */}
      <div className="group">
        <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Server className="w-4 h-4 text-white" />
          </div>
          Number of Instances (Content)
        </label>
        <input
          type="number"
          min="0"
          value={config.contentConfig?.numberOfInstances || ''}
          onChange={(e) => {
            const value = parseInt(e.target.value) || 0;
            setConfig(prev => ({
              ...prev,
              contentConfig: {
                ...prev.contentConfig,
                numberOfUsers: prev.contentConfig?.numberOfUsers || 0,
                instanceType: prev.contentConfig?.instanceType || 'Small',
                numberOfInstances: value,
                duration: prev.contentConfig?.duration || 0,
                dataSizeGB: prev.contentConfig?.dataSizeGB || 0
              }
            }));
          }}
          className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-300 bg-white/80"
          placeholder="Enter number of instances"
        />
      </div>

      {/* Duration */}
      <div className="group">
        <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center">
            <Clock className="w-4 h-4 text-white" />
          </div>
          Duration (Content)
        </label>
        <input
          type="number"
          min="1"
          value={config.contentConfig?.duration || ''}
          onChange={(e) => {
            const value = parseInt(e.target.value) || 0;
            setConfig(prev => ({
              ...prev,
              contentConfig: {
                ...prev.contentConfig,
                numberOfUsers: prev.contentConfig?.numberOfUsers || 0,
                instanceType: prev.contentConfig?.instanceType || 'Small',
                numberOfInstances: prev.contentConfig?.numberOfInstances || 0,
                duration: value,
                dataSizeGB: prev.contentConfig?.dataSizeGB || 0
              }
            }));
          }}
          className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-300 bg-white/80"
          placeholder="Enter duration in months"
        />
      </div>

      {/* Data Size */}
      <div className="group md:col-span-2">
        <label className="flex items-center gap-3 text-sm font-semibold text-gray-800 mb-3">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <Database className="w-4 h-4 text-white" />
          </div>
          Data Size (GB)
        </label>
        <input
          type="number"
          min="0"
          value={config.contentConfig?.dataSizeGB || ''}
          onChange={(e) => {
            const value = parseInt(e.target.value) || 0;
            setConfig(prev => ({
              ...prev,
              contentConfig: {
                ...prev.contentConfig,
                numberOfUsers: prev.contentConfig?.numberOfUsers || 0,
                instanceType: prev.contentConfig?.instanceType || 'Small',
                numberOfInstances: prev.contentConfig?.numberOfInstances || 0,
                duration: prev.contentConfig?.duration || 0,
                dataSizeGB: value
              }
            }));
          }}
          className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-300 bg-white/80"
          placeholder="Enter data size in GB"
        />
      </div>
    </div>
  </div>
)}

{/* Warning if only Email exhibits are selected */}
{config.migrationType === 'Multi combination' && selectedExhibitCategories.hasEmail && !selectedExhibitCategories.hasMessaging && !selectedExhibitCategories.hasContent && (
  <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-8 text-center">
    <p className="text-yellow-800 font-semibold">
      ⚠️ Please select at least one Message or Content exhibit to configure pricing.
    </p>
    <p className="text-yellow-600 text-sm mt-2">
      Email exhibits are attachments only and don't require separate pricing configuration.
    </p>
  </div>
)}

{/* Keep the single configuration section for non-Multi combination types */}
{config.migrationType && config.migrationType !== 'Multi combination' && (config.combination || config.migrationType === 'Multi combination') && (
  <div data-section="project-configuration" className="bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/50 rounded-2xl shadow-2xl border border-blue-100/50 p-8 backdrop-blur-sm">
    {/* Keep existing single configuration section for Content, Messaging, Overage Agreement */}
    {/* Lines 1270-1517 as they currently exist */}
  </div>
)}
```

#### 3. Update the Calculate Pricing button condition (line 1520)

Change from:
```typescript
{config.migrationType && (config.combination || config.migrationType === 'Multi combination') && (
```

To:
```typescript
{config.migrationType && (
  (config.combination && config.migrationType !== 'Multi combination') ||
  (config.migrationType === 'Multi combination' && (selectedExhibitCategories.hasMessaging || selectedExhibitCategories.hasContent))
) && (
```

### 🔄 Next Steps - Pricing Logic

After UI is complete, we need to update:

1. **`src/utils/pricing.ts`** - Add Multi combination pricing calculation:
   - Detect if `config.messagingConfig` exists → calculate Messaging price
   - Detect if `config.contentConfig` exists → calculate Content price  
   - Sum both totals
   - Return combined calculation with breakdown

2. **`src/components/PricingComparison.tsx`** - Display separate breakdowns for Multi combination

3. **`src/App.tsx`** - Update the configuration change handler to propagate Multi combination configs

## Testing Checklist

- [ ] Select Multi combination migration type
- [ ] Select only Messaging exhibit → see only Messaging config section
- [ ] Select only Content exhibit → see only Content config section
- [ ] Select both → see both separate sections
- [ ] Select only Email exhibit → see warning message
- [ ] Fill both sections → verify pricing calculates and sums correctly
- [ ] Verify discount still applies to combined total
- [ ] Verify quote generation includes both configurations
- [ ] Verify document generation merges both exhibits

## Questions Answered

1. ✅ Fields are **separate** (Messaging has its own, Content has its own)
2. ✅ Email exhibits are **attachments only** (no pricing section)
3. ✅ Total price is **Simple Sum** (Messaging + Content)

