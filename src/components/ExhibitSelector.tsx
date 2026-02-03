import React, { useMemo, useState, useEffect } from 'react';
import { Check, ChevronRight, Search, ArrowRight, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '../config/api';

interface Exhibit {
  _id: string;
  name: string;
  description: string;
  fileName: string;
  combinations: string[];
  category?: string;
  planType?: string; // 'basic' | 'standard' | 'advanced' | ''
  isRequired: boolean;
  displayOrder: number;
}

interface ExhibitSelectorProps {
  combination: string;
  selectedExhibits: string[];
  onExhibitsChange: (exhibitIds: string[]) => void;
  selectedTier?: { tier: { name: string } } | null;
}

const ExhibitSelector: React.FC<ExhibitSelectorProps> = ({
  selectedExhibits,
  onExhibitsChange,
  selectedTier
}) => {
  const navigate = useNavigate();
  const [exhibits, setExhibits] = useState<Exhibit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadExhibits();
  }, []); // Load all exhibits once on mount, regardless of combination

  // Validate restored selectedExhibits against loaded exhibits
  // This ensures restored selections are preserved even if they're restored after exhibits load
  useEffect(() => {
    // Only validate if we have both selections and exhibits loaded
    if (selectedExhibits.length > 0 && exhibits.length > 0) {
      const allExhibitIds = exhibits.map(ex => ex._id);
      const validSelections = selectedExhibits.filter(id => allExhibitIds.includes(id));
      const invalidSelections = selectedExhibits.filter(id => !allExhibitIds.includes(id));
      
      // Check if validation is needed
      const needsCleanup = invalidSelections.length > 0;
      const requiredIds = exhibits.filter(ex => ex.isRequired).map(ex => ex._id);
      const missingRequired = requiredIds.filter(id => !validSelections.includes(id));
      const needsRequired = missingRequired.length > 0;
      
      if (needsCleanup || needsRequired) {
        console.log('📎 ExhibitSelector: Validating restored selectedExhibits:', {
          count: selectedExhibits.length,
          validCount: validSelections.length,
          invalidCount: invalidSelections.length,
          missingRequiredCount: missingRequired.length,
          totalExhibitsLoaded: exhibits.length
        });
        
        if (needsCleanup) {
          console.log('⚠️ Removing invalid exhibit IDs:', invalidSelections);
        }
        if (needsRequired) {
          console.log('➕ Adding missing required exhibits:', missingRequired);
        }
        
        // Build final selection: valid selections + missing required
        const finalSelection = [...new Set([...validSelections, ...missingRequired])];
        
        // Only update if selection actually changed
        if (JSON.stringify(finalSelection.sort()) !== JSON.stringify(selectedExhibits.sort())) {
          onExhibitsChange(finalSelection);
          console.log('✅ Validated and updated exhibit selection');
        }
      } else {
        // All selections are valid and required are included - no action needed
        console.log('✅ All selected exhibits are valid and required exhibits are included');
      }
    }
  }, [selectedExhibits, exhibits.length, onExhibitsChange]); // Re-validate when either changes

  const loadExhibits = async () => {
    try {
      setLoading(true);
      console.log('📎 Loading ALL exhibits from backend (no combination filter)');
      
      // Fetch ALL exhibits without filtering by combination
      const response = await fetch(
        `${BACKEND_URL}/api/exhibits`
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Loaded ${data.exhibits?.length || 0} total exhibits from backend`);
        
        if (data.success) {
          // Always set exhibits (even if empty array)
          setExhibits(data.exhibits || []);
          
          // Auto-select required exhibits and clean up previously selected exhibits that are no longer required
          if (data.exhibits && data.exhibits.length > 0) {
            const requiredIds: string[] = data.exhibits
              .filter((ex: Exhibit) => ex.isRequired)
              .map((ex: Exhibit) => ex._id);
            
            const allExhibitIds = data.exhibits.map((ex: Exhibit) => ex._id);
            
            // Remove any selected exhibits that no longer exist
            const validSelections = selectedExhibits.filter(id => allExhibitIds.includes(id));
            
            // Check if user has manually selected exhibits (not just required ones)
            // If they have selections beyond required exhibits, preserve them
            const hasUserSelections = validSelections.length > 0 && 
              validSelections.some(id => !requiredIds.includes(id));
            
            // Add required exhibits to the selection (always include required)
            const newSelection = [...new Set([...validSelections, ...requiredIds])];
            
            // Only update if:
            // 1. Selection actually changed AND
            // 2. Either there are no user selections OR we're just adding required exhibits
            const selectionChanged = JSON.stringify(newSelection.sort()) !== JSON.stringify(selectedExhibits.sort());
            
            // IMPORTANT: If user has selections (restored or manually selected), preserve them
            if (hasUserSelections) {
              // User has selections - preserve them but ensure required are included
              console.log('📎 Preserving user selections during exhibit load:', {
                userSelections: validSelections,
                requiredIds,
                newSelection,
                willAddMissingRequired: requiredIds.filter((id: string) => !validSelections.includes(id)).length > 0
              });
              // Only update if we need to add required exhibits that aren't already selected
              const missingRequired = requiredIds.filter((id: string) => !validSelections.includes(id));
              if (missingRequired.length > 0) {
                const finalSelection = [...new Set([...validSelections, ...missingRequired])];
                onExhibitsChange(finalSelection);
              }
              // Don't overwrite user selections with just required exhibits
            } else if (selectionChanged && validSelections.length === 0) {
              // No user selections - just add required exhibits
              console.log('🔄 No user selections, adding required exhibits:', { 
                previous: selectedExhibits, 
                newSelection, 
                requiredIds,
                removedInvalid: selectedExhibits.filter(id => !allExhibitIds.includes(id))
              });
              onExhibitsChange(newSelection);
            } else {
              console.log('⏭️ Skipping exhibit selection update - no changes needed:', {
                hasUserSelections,
                validSelectionsCount: validSelections.length,
                selectionChanged
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error loading exhibits:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter exhibits based on selected tier (Basic/Standard/Advanced)
  const filteredExhibits = useMemo(() => {
    if (!selectedTier?.tier?.name) {
      // No tier selected, show all exhibits
      return exhibits;
    }

    const tierName = selectedTier.tier.name.toLowerCase();
    
    // Filter exhibits to only show those matching the selected tier
    return exhibits.filter(exhibit => {
      // First check if exhibit has planType field (new way - more reliable)
      if (exhibit.planType) {
        return exhibit.planType.toLowerCase() === tierName;
      }
      
      // Fallback: Check if exhibit name contains a plan type (legacy support)
      const exhibitName = exhibit.name.toLowerCase();
      const hasStandard = exhibitName.includes('standard');
      const hasAdvanced = exhibitName.includes('advanced');
      const hasBasic = exhibitName.includes('basic');
      const hasPremium = exhibitName.includes('premium');
      const hasEnterprise = exhibitName.includes('enterprise');
      
      // If exhibit has a plan type in name, filter by matching tier
      if (hasStandard || hasAdvanced || hasBasic || hasPremium || hasEnterprise) {
        if (tierName === 'basic') {
          return hasBasic && !hasStandard && !hasAdvanced;
        } else if (tierName === 'standard') {
          return hasStandard && !hasAdvanced && !hasBasic;
        } else if (tierName === 'advanced') {
          return hasAdvanced && !hasStandard && !hasBasic;
        } else if (tierName === 'premium') {
          return hasPremium;
        } else if (tierName === 'enterprise') {
          return hasEnterprise;
        }
        // If tier doesn't match any plan type, don't show this exhibit
        return false;
      }
      
      // For exhibits without explicit plan type, show them (they're generic)
      return true;
    });
  }, [exhibits, selectedTier]);

  // Auto-select ALL matching tier exhibits when tier changes
  // When a plan (Basic/Standard/Advanced) is selected, automatically select ALL exhibits for that plan
  // This includes both "Include" and "Not Include" variants for all combinations
  useEffect(() => {
    if (!selectedTier?.tier?.name || exhibits.length === 0) {
      return; // No tier selected or exhibits not loaded yet
    }

    const tierName = selectedTier.tier.name.toLowerCase();
    
    // Find ALL exhibits that match the selected tier (both Include and Not Include variants)
    const matchingExhibitIds = exhibits
      .filter(ex => {
        // First check planType field (most reliable)
        if (ex.planType) {
          return ex.planType.toLowerCase() === tierName;
        }
        
        // Fallback: Check exhibit name for plan type
        const exhibitName = ex.name.toLowerCase();
        const hasStandard = exhibitName.includes('standard');
        const hasAdvanced = exhibitName.includes('advanced');
        const hasBasic = exhibitName.includes('basic');
        const hasPremium = exhibitName.includes('premium');
        const hasEnterprise = exhibitName.includes('enterprise');
        
        // If exhibit has a plan type in name, check if it matches selected tier
        if (hasStandard || hasAdvanced || hasBasic || hasPremium || hasEnterprise) {
          if (tierName === 'basic') {
            return hasBasic && !hasStandard && !hasAdvanced;
          } else if (tierName === 'standard') {
            return hasStandard && !hasAdvanced && !hasBasic;
          } else if (tierName === 'advanced') {
            return hasAdvanced && !hasStandard && !hasBasic;
          } else if (tierName === 'premium') {
            return hasPremium;
          } else if (tierName === 'enterprise') {
            return hasEnterprise;
          }
          return false;
        }
        
        // Don't auto-select exhibits without explicit plan type (generic exhibits)
        // User must manually select these
        return false;
      })
      .map(ex => ex._id);

    // Always include required exhibits (they should always be selected)
    const requiredExhibitIds = exhibits
      .filter(ex => ex.isRequired)
      .map(ex => ex._id);

    // Combine: matching tier exhibits + required exhibits + keep any manually selected exhibits without plan types
    const exhibitsWithoutPlanType = selectedExhibits.filter(id => {
      const ex = exhibits.find(e => e._id === id);
      if (!ex) return false;
      // Keep if it doesn't have a plan type (user manually selected generic exhibits)
      if (!ex.planType) {
        const name = ex.name.toLowerCase();
        const hasPlanInName = name.includes('basic') || name.includes('standard') || 
                             name.includes('advanced') || name.includes('premium') || 
                             name.includes('enterprise');
        return !hasPlanInName;
      }
      return false;
    });

    // Final selection: matching tier exhibits + required + manually selected generic exhibits
    const finalSelection = Array.from(new Set([
      ...matchingExhibitIds,
      ...requiredExhibitIds,
      ...exhibitsWithoutPlanType
    ]));

    // Only update if the selection would change
    if (JSON.stringify(finalSelection.sort()) !== JSON.stringify(selectedExhibits.sort())) {
      const matchingExhibitNames = exhibits
        .filter(ex => matchingExhibitIds.includes(ex._id))
        .map(ex => ({ name: ex.name, planType: ex.planType, id: ex._id }));
      
      console.log('✅ Auto-selecting exhibits for tier:', tierName, {
        matchingCount: matchingExhibitIds.length,
        requiredCount: requiredExhibitIds.length,
        genericCount: exhibitsWithoutPlanType.length,
        totalSelected: finalSelection.length,
        previousSelectionCount: selectedExhibits.length,
        matchingExhibits: matchingExhibitNames.slice(0, 10), // Show first 10 for debugging
        allMatchingExhibitNames: matchingExhibitNames.map(e => e.name)
      });
      
      // Log which exhibits are being added/removed
      const added = finalSelection.filter(id => !selectedExhibits.includes(id));
      const removed = selectedExhibits.filter(id => !finalSelection.includes(id));
      if (added.length > 0) {
        console.log('➕ Adding exhibits:', added.map(id => {
          const ex = exhibits.find(e => e._id === id);
          return ex ? ex.name : id;
        }));
      }
      if (removed.length > 0) {
        console.log('➖ Removing exhibits:', removed.map(id => {
          const ex = exhibits.find(e => e._id === id);
          return ex ? ex.name : id;
        }));
      }
      
      onExhibitsChange(finalSelection);
    } else {
      console.log('✅ Exhibits already match selected tier:', tierName, {
        currentSelectionCount: selectedExhibits.length,
        matchingCount: matchingExhibitIds.length
      });
    }
  }, [selectedTier, exhibits.length, onExhibitsChange]); // Removed selectedExhibits from deps to avoid infinite loop

  // Filter exhibits by search query
  const searchFilteredExhibits = useMemo(() => {
    if (!searchQuery.trim()) {
      return filteredExhibits;
    }
    const query = searchQuery.toLowerCase().trim();
    return filteredExhibits.filter(exhibit => 
      exhibit.name.toLowerCase().includes(query)
    );
  }, [filteredExhibits, searchQuery]);

  // Helper function to extract base combination from combination string
  const extractBaseCombination = (combination: string): string => {
    if (!combination || combination === 'all') return '';
    
    let base = combination.toLowerCase();
    
    // Normalize dropbox-to-mydrive to dropbox-to-google-mydrive (merge into same group)
    if (base === 'dropbox-to-mydrive' || base.startsWith('dropbox-to-mydrive-')) {
      base = base.replace(/^dropbox-to-mydrive/, 'dropbox-to-google-mydrive');
    }
    
    // Remove plan type suffixes
    base = base.replace(/-(basic|standard|advanced|premium|enterprise)$/, '');
    
    // Remove include/notinclude suffixes
    base = base.replace(/-(included|include|notincluded|not-include|notinclude|excluded)$/, '');
    
    // Clean up any trailing dashes
    base = base.replace(/-+$/, '').trim();
    
    return base;
  };

  // Helper function to format combination for display (e.g., "testing-to-production" -> "Testing to Production")
  const formatCombinationForDisplay = (combination: string): string => {
    if (!combination) return '';
    
    // Special case: map "dropbox-to-google" to "Dropbox To Google Shared Drive"
    if (combination.toLowerCase() === 'dropbox-to-google') {
      return 'Dropbox To Google Shared Drive';
    }
    
    return combination
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Process exhibits for flat list display (handle grouping)
  const processedExhibits = useMemo(() => {
    // Filter out generic "Included Features" and "Not Included Features" exhibits (without plan type)
    // These are redundant with plan-specific exhibits (e.g., "Standard Include", "Advanced Include")
    const filtered = searchFilteredExhibits.filter(exhibit => {
      const name = exhibit.name || '';
      // Check if it ends with " - Included Features" or " - Not Included Features" (without plan type)
      const endsWithIncludedFeatures = / - (Included|Not Included) Features$/i.test(name);
      if (endsWithIncludedFeatures) {
        // Only exclude if it doesn't have a plan type in the name
        const hasPlanType = /\b(Basic|Standard|Advanced|Premium|Enterprise)\s+(Plan\s*-)?\s*(Included|Not Included|Include|Not Include)/i.test(name);
        return hasPlanType; // Keep if it has a plan type, exclude if it doesn't
      }
      return true; // Keep all other exhibits
    });
    
    const sorted = [...filtered].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    
    // Group exhibits by base combination extracted from combinations field
    const groups: Map<string, Exhibit[]> = new Map();
    const ungrouped: Exhibit[] = [];
    // Track which exhibits have been added to a group to prevent duplicates
    const addedExhibitIds = new Set<string>();

    // Hide legacy ShareFile groups in UI (we use the merged "Google Drive (MyDrive & Shared Drive)" group instead)
    const hiddenGroupNames = new Set([
      'ShareFile to Google Shared Drive',
      'Sharefile To Google Sharedrive', // Format: "sharefile-to-google-sharedrive" -> "Sharefile To Google Sharedrive"
      'ShareFile to Google MyDrive',
      'Sharefile To Google Mydrive', // Format: "sharefile-to-google-mydrive" -> "Sharefile To Google Mydrive"
      // Hide legacy Dropbox groups in UI (we use the merged "Google Drive (MyDrive & Shared Drive)" group instead)
      'Dropbox to MyDrive',
      'Dropbox To Google Mydrive', // Format: "dropbox-to-google-mydrive" -> "Dropbox To Google Mydrive"
      'Dropbox to Google Shared Drive',
    ]);
    
    sorted.forEach((exhibit) => {
      // Skip if already added to a group (prevent duplicates)
      if (addedExhibitIds.has(exhibit._id)) {
        return;
      }
      
      // Get the first combination (or 'all' if no combinations)
      const primaryCombination = exhibit.combinations && exhibit.combinations.length > 0 
        ? exhibit.combinations[0] 
        : 'all';
      
      // Extract base combination (e.g., "testing-to-production" from "testing-to-production-include-basic")
      const baseCombination = extractBaseCombination(primaryCombination);
      
      if (baseCombination && baseCombination !== 'all' && baseCombination.length >= 3) {
        // Use base combination as folder name
        const folderName = formatCombinationForDisplay(baseCombination);
        
        // Skip rendering these groups entirely in the UI (case-insensitive check)
        const folderNameLower = folderName.toLowerCase();
        const shouldHide = Array.from(hiddenGroupNames).some(hiddenName => 
          hiddenName.toLowerCase() === folderNameLower
        );
        if (shouldHide) {
          return;
        }
        
        if (!groups.has(folderName)) {
          groups.set(folderName, []);
        }
        groups.get(folderName)!.push(exhibit);
        addedExhibitIds.add(exhibit._id);
      } else {
        // Fallback: Try grouping by name pattern (for backward compatibility)
        const dashIndex = exhibit.name.indexOf(' - ');
        if (dashIndex > 0) {
          const baseName = exhibit.name.substring(0, dashIndex);
          let folderName = baseName
            .replace(/\s+(Basic|Standard|Advanced|Premium)\s+Plan$/i, '')
            .trim();
          
          if (!folderName || folderName.length < 3) {
            folderName = baseName;
          }
          
          // Skip rendering these groups entirely in the UI
          if (hiddenGroupNames.has(folderName)) {
            return;
          }
          
          if (!groups.has(folderName)) {
            groups.set(folderName, []);
          }
          groups.get(folderName)!.push(exhibit);
          addedExhibitIds.add(exhibit._id);
        } else {
          ungrouped.push(exhibit);
          addedExhibitIds.add(exhibit._id);
        }
      }
    });
    
    // Convert groups to flat list items
    const result: Array<{ 
      id: string; 
      name: string; 
      exhibits: Exhibit[]; 
      isGroup: boolean;
      displayOrder: number;
    }> = [];
    
    // Add groups (only if they have more than 1 exhibit, otherwise treat as ungrouped)
    groups.forEach((exhibits, folderName) => {
      if (exhibits.length > 1) {
        // Deduplicate exhibits within the group by their display label (the part after " - ")
        // Keep the most specific exhibit (prefer exhibits specific to this combination over merged ones)
        const deduplicatedExhibits: Exhibit[] = [];
        const seenLabels = new Map<string, Exhibit>();
        
        // Sort exhibits to process more specific ones first (non-merged before merged)
        const sortedExhibits = [...exhibits].sort((a, b) => {
          const aIsMerged = a.name.includes('(MyDrive & Shared Drive)');
          const bIsMerged = b.name.includes('(MyDrive & Shared Drive)');
          if (aIsMerged && !bIsMerged) return 1; // Merged ones go last
          if (!aIsMerged && bIsMerged) return -1;
          return 0;
        });
        
        sortedExhibits.forEach(exhibit => {
          const dashIndex = exhibit.name.indexOf(' - ');
          const label = dashIndex > 0 ? exhibit.name.substring(dashIndex + 3) : exhibit.name;
          
          // Only add if we haven't seen this label before, or if this one is more specific
          if (!seenLabels.has(label)) {
            seenLabels.set(label, exhibit);
            deduplicatedExhibits.push(exhibit);
          }
          // If label already exists, skip this exhibit (we already have a more specific one)
        });
        
        result.push({
          id: `group-${folderName}`,
          name: folderName,
          exhibits: deduplicatedExhibits,
          isGroup: true,
          displayOrder: Math.min(...deduplicatedExhibits.map(e => e.displayOrder ?? 0))
        });
      } else {
        ungrouped.push(exhibits[0]);
      }
    });
    
    // Add ungrouped exhibits
    ungrouped.forEach(exhibit => {
      result.push({
        id: exhibit._id,
        name: exhibit.name,
        exhibits: [exhibit],
        isGroup: false,
        displayOrder: exhibit.displayOrder ?? 0
      });
    });
    
    // Sort by display order
    return result.sort((a, b) => a.displayOrder - b.displayOrder);
  }, [searchFilteredExhibits]);


  const toggleExhibit = (exhibitId: string, isRequired: boolean) => {
    if (isRequired) return; // Cannot deselect required exhibits
    
    if (selectedExhibits.includes(exhibitId)) {
      onExhibitsChange(selectedExhibits.filter(id => id !== exhibitId));
    } else {
      onExhibitsChange([...selectedExhibits, exhibitId]);
    }
  };

  const handleUnselectAll = () => {
    // Only unselect non-required exhibits
    const requiredIds = exhibits.filter(ex => ex.isRequired).map(ex => ex._id);
    onExhibitsChange(requiredIds);
  };

  const hasAnyExhibits = filteredExhibits.length > 0;

  return (
    <div className="flex justify-center">
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-5 mb-4 w-full max-w-4xl">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <ArrowRight className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-0.5">Search and select migration</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Choose your migration type to configure the project requirements.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadExhibits}
              disabled={loading}
              className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md text-xs font-medium transition-colors flex-shrink-0 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh exhibits from backend"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleUnselectAll}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-xs font-medium transition-colors flex-shrink-0"
            >
              Unselect All
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search migration types..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-gray-700 placeholder-gray-400"
            />
          </div>
        </div>

        {/* Helpful message for adding exhibits */}
        <div className="mb-3 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-gray-700 text-center">
            If you can't find the combination you need,{' '}
            <button
              type="button"
              onClick={() => navigate('/exhibits')}
              className="text-blue-600 hover:text-blue-700 underline font-medium"
            >
              go to Exhibits
            </button>
            {' '}and you can add them. Those will reflect here.
          </p>
        </div>

        {/* Exhibits List Container */}
        {loading ? (
          <div className="animate-pulse bg-gray-100 rounded-lg p-4 h-32"></div>
        ) : !hasAnyExhibits ? (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 leading-relaxed">
            No exhibits found for this combination yet. Add exhibit DOCX files in <code className="font-mono">CPQ12/backend-exhibits/</code> and restart backend seeding.
          </div>
        ) : (
          <div className="bg-blue-50/30 rounded-lg border border-blue-200 p-4">
            <div className="mb-3">
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Exhibits</h4>
            </div>
            <div 
              className="max-h-[200px] overflow-y-auto space-y-2"
              style={{ 
                scrollbarWidth: 'thin', 
                scrollbarColor: '#9ca3af #f3f4f6',
              }}
            >
              {processedExhibits.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-8">
                  No exhibits match your search.
                </div>
              ) : (
                processedExhibits.map((item, index) => {
                  const isGroup = item.isGroup;
                  const allExhibitsSelected = item.exhibits.every(ex => selectedExhibits.includes(ex._id));
                  const someExhibitsSelected = item.exhibits.some(ex => selectedExhibits.includes(ex._id));
                  const hasRequired = item.exhibits.some(ex => ex.isRequired);
                  const fileCount = item.exhibits.length;
                  // For groups: treat as selected if ANY child is selected (since a "migration" is conceptually one selection).
                  const isSelected = isGroup ? someExhibitsSelected : selectedExhibits.includes(item.exhibits[0]._id);
                  const isExpanded = isGroup ? expandedGroups.has(item.id) : false;

                  const handleClick = () => {
                    if (isGroup) {
                      // IMPORTANT: A group represents ONE migration, but it may have multiple exhibit files
                      // (Included/Not Included, plan variants: Basic, Standard, Advanced, etc).
                      // Clicking the group should select ALL exhibits in the group (all Include + Not Include variants for all plans).
                      // The agreement generation will later filter by selected plan, but here we select all variants.
                      const nonRequiredExhibits = item.exhibits.filter(ex => !ex.isRequired);
                      const requiredExhibits = item.exhibits.filter(ex => ex.isRequired);
                      const requiredIds = requiredExhibits.map(ex => ex._id);
                      const nonRequiredIds = nonRequiredExhibits.map(ex => ex._id);

                      if (someExhibitsSelected) {
                        // Deselect all non-required exhibits in the group
                        onExhibitsChange(
                          selectedExhibits.filter(id => !nonRequiredIds.includes(id))
                        );
                      } else {
                        // Select ALL exhibits in the group (all Include + Not Include variants for all plans)
                        const allGroupIds = [...requiredIds, ...nonRequiredIds];
                        const newSelection = [...new Set([...selectedExhibits, ...allGroupIds])];
                        onExhibitsChange(newSelection);
                        console.log('✅ Selected all variants in group:', {
                          groupName: item.name,
                          selectedCount: allGroupIds.length,
                          exhibits: item.exhibits.map(ex => ex.name)
                        });
                      }
                    } else {
                      toggleExhibit(item.exhibits[0]._id, item.exhibits[0].isRequired);
                    }
                  };

                  const header = (
                    <button
                      key={`${item.id}-header`}
                      type="button"
                      onClick={handleClick}
                      disabled={hasRequired && isGroup}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-white shadow-sm'
                          : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50'
                      } ${hasRequired && isGroup ? 'opacity-90 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className="flex items-center gap-2.5">
                        {/* Expand/collapse chevron for groups (clicking it shouldn't toggle selection) */}
                        {isGroup ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedGroups(prev => {
                                const next = new Set(prev);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                return next;
                              });
                            }}
                            className="w-5 h-5 flex items-center justify-center flex-shrink-0 rounded hover:bg-gray-100"
                            aria-label={isExpanded ? 'Collapse group' : 'Expand group'}
                          >
                            <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </button>
                        ) : (
                          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                            <ChevronRight className="w-3.5 h-3.5 text-gray-300 opacity-0" />
                          </div>
                        )}

                        <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-semibold text-gray-700">{index + 1}</span>
                        </div>
                        <div
                          className={`w-4 h-4 border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300 bg-white'
                          }`}
                        >
                          {/* For groups, show an indeterminate mark when partially selected, check when fully selected */}
                          {!isGroup && isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                          {isGroup && allExhibitsSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                          {isGroup && someExhibitsSelected && !allExhibitsSelected && (
                            <div className="w-2 h-0.5 bg-white rounded-sm" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-900 text-xs leading-tight">{item.name}</div>
                        </div>
                        <div className="text-[10px] text-gray-500 flex-shrink-0 whitespace-nowrap">
                          ({fileCount} {fileCount === 1 ? 'file' : 'files'})
                        </div>
                      </div>
                    </button>
                  );

                  if (!isGroup) return header;

                  return (
                    <div key={item.id} className="space-y-1">
                      {header}
                      {isExpanded && (
                        <div className="ml-10 mr-2 space-y-1">
                          {item.exhibits
                            .slice()
                            .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
                            .map((ex) => {
                              const isExSelected = selectedExhibits.includes(ex._id);
                              const dashIndex = ex.name.indexOf(' - ');
                              const childLabel = dashIndex > 0 ? ex.name.substring(dashIndex + 3) : ex.name;
                              return (
                                <button
                                  key={ex._id}
                                  type="button"
                                  onClick={() => toggleExhibit(ex._id, ex.isRequired)}
                                  disabled={ex.isRequired}
                                  className={`w-full text-left px-2.5 py-2 rounded-md border transition-all ${
                                    isExSelected
                                      ? 'border-blue-400 bg-white'
                                      : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-gray-50'
                                  } ${ex.isRequired ? 'opacity-90 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div
                                      className={`w-4 h-4 border-2 flex items-center justify-center flex-shrink-0 ${
                                        isExSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300 bg-white'
                                      }`}
                                    >
                                      {isExSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                                    </div>
                                    <div className="text-[11px] text-gray-800 font-medium">{childLabel}</div>
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExhibitSelector;
