import React, { useMemo, useState, useEffect } from 'react';
import { Check, ChevronRight, Search, ArrowRight } from 'lucide-react';
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
  const [exhibits, setExhibits] = useState<Exhibit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadExhibits();
  }, []); // Load all exhibits once on mount, regardless of combination

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
            const requiredIds = data.exhibits
              .filter((ex: Exhibit) => ex.isRequired)
              .map((ex: Exhibit) => ex._id);
            
            const allExhibitIds = data.exhibits.map((ex: Exhibit) => ex._id);
            
            // Remove any selected exhibits that no longer exist or are no longer required
            const validSelections = selectedExhibits.filter(id => allExhibitIds.includes(id));
            
            // Add required exhibits to the selection
            const newSelection = [...new Set([...validSelections, ...requiredIds])];
            
            // Only update if the selection changed
            if (JSON.stringify(newSelection.sort()) !== JSON.stringify(selectedExhibits.sort())) {
              console.log('🔄 Updating exhibit selection:', { 
                previous: selectedExhibits, 
                newSelection, 
                requiredIds,
                removedInvalid: selectedExhibits.filter(id => !allExhibitIds.includes(id))
              });
              onExhibitsChange(newSelection);
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

  // Auto-select only matching tier exhibits when tier changes
  useEffect(() => {
    if (!selectedTier?.tier?.name) {
      return; // No tier selected, don't filter
    }

    const tierName = selectedTier.tier.name.toLowerCase();
    
    // Filter all exhibits by tier (not just Slack to Teams)
    const matchingExhibitIds = exhibits
      .filter(ex => {
        const exhibitName = ex.name.toLowerCase();
        const hasStandard = exhibitName.includes('standard');
        const hasAdvanced = exhibitName.includes('advanced');
        const hasBasic = exhibitName.includes('basic');
        const hasPremium = exhibitName.includes('premium');
        const hasEnterprise = exhibitName.includes('enterprise');
        
        // If exhibit has a plan type, check if it matches selected tier
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
        
        // Keep exhibits without explicit plan type (generic exhibits)
        return true;
      })
      .map(ex => ex._id)
      .filter(id => selectedExhibits.includes(id)); // Only keep currently selected exhibits that match tier

    // Only update if the selection would change
    if (JSON.stringify(matchingExhibitIds.sort()) !== JSON.stringify(selectedExhibits.sort())) {
      console.log('🔄 Auto-filtering exhibits for tier:', tierName, {
        currentSelection: selectedExhibits,
        filteredSelection: matchingExhibitIds,
        removed: selectedExhibits.filter(id => !matchingExhibitIds.includes(id))
      });
      onExhibitsChange(matchingExhibitIds);
    }
  }, [selectedTier, exhibits, selectedExhibits, onExhibitsChange]);

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
    
    return combination
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Process exhibits for flat list display (handle grouping)
  const processedExhibits = useMemo(() => {
    const sorted = [...searchFilteredExhibits].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    
    // Group exhibits by base combination extracted from combinations field
    const groups: Map<string, Exhibit[]> = new Map();
    const ungrouped: Exhibit[] = [];
    
    sorted.forEach((exhibit) => {
      // Get the first combination (or 'all' if no combinations)
      const primaryCombination = exhibit.combinations && exhibit.combinations.length > 0 
        ? exhibit.combinations[0] 
        : 'all';
      
      // Extract base combination (e.g., "testing-to-production" from "testing-to-production-include-basic")
      const baseCombination = extractBaseCombination(primaryCombination);
      
      if (baseCombination && baseCombination !== 'all' && baseCombination.length >= 3) {
        // Use base combination as folder name
        const folderName = formatCombinationForDisplay(baseCombination);
        
        if (!groups.has(folderName)) {
          groups.set(folderName, []);
        }
        groups.get(folderName)!.push(exhibit);
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
          
          if (!groups.has(folderName)) {
            groups.set(folderName, []);
          }
          groups.get(folderName)!.push(exhibit);
        } else {
          ungrouped.push(exhibit);
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
        result.push({
          id: `group-${folderName}`,
          name: folderName,
          exhibits,
          isGroup: true,
          displayOrder: Math.min(...exhibits.map(e => e.displayOrder ?? 0))
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
            <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
              <ArrowRight className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-0.5">Search and select migration</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Choose your migration type to configure the project requirements.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleUnselectAll}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-xs font-medium transition-colors flex-shrink-0"
          >
            Unselect All
          </button>
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
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm text-gray-700 placeholder-gray-400"
            />
          </div>
        </div>

        {/* Exhibits List Container */}
        {loading ? (
          <div className="animate-pulse bg-gray-100 rounded-lg p-4 h-32"></div>
        ) : !hasAnyExhibits ? (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 leading-relaxed">
            No exhibits found for this combination yet. Add exhibit DOCX files in <code className="font-mono">CPQ12/backend-exhibits/</code> and restart backend seeding.
          </div>
        ) : (
          <div className="bg-purple-50/30 rounded-lg border border-purple-200 p-4">
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
                  const isSelected = isGroup ? allExhibitsSelected : selectedExhibits.includes(item.exhibits[0]._id);
                  const isExpanded = isGroup && expandedGroups.has(item.id);

                  const handleToggleExpand = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (isGroup) {
                      const newExpanded = new Set(expandedGroups);
                      if (newExpanded.has(item.id)) {
                        newExpanded.delete(item.id);
                      } else {
                        newExpanded.add(item.id);
                      }
                      setExpandedGroups(newExpanded);
                    }
                  };

                  const handleClick = () => {
                    if (isGroup) {
                      // Toggle all non-required exhibits in the group
                      const nonRequiredExhibits = item.exhibits.filter(ex => !ex.isRequired);
                      if (allExhibitsSelected) {
                        // Deselect all
                        onExhibitsChange(selectedExhibits.filter(id => 
                          !nonRequiredExhibits.some(ex => ex._id === id)
                        ));
                      } else {
                        // Select all
                        const newIds = nonRequiredExhibits
                          .filter(ex => !selectedExhibits.includes(ex._id))
                          .map(ex => ex._id);
                        if (newIds.length > 0) {
                          onExhibitsChange([...selectedExhibits, ...newIds]);
                        }
                      }
                    } else {
                      toggleExhibit(item.exhibits[0]._id, item.exhibits[0].isRequired);
                    }
                  };

                  return (
                    <div key={item.id} className="space-y-1">
                      <button
                        type="button"
                        onClick={handleClick}
                        disabled={hasRequired && isGroup}
                        className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                          isSelected
                            ? 'border-purple-500 bg-white shadow-sm'
                            : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-gray-50'
                        } ${hasRequired && isGroup ? 'opacity-90 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={handleToggleExpand}
                            className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          >
                            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                          <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-semibold text-gray-700">{index + 1}</span>
                          </div>
                          <div
                            className={`w-4 h-4 border-2 flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'border-purple-500 bg-purple-500' : 'border-gray-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                            {isGroup && someExhibitsSelected && !allExhibitsSelected && (
                              <div className="w-1.5 h-1.5 bg-purple-500 rounded-sm" />
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
                      
                      {/* Show individual exhibits when group is expanded */}
                      {isGroup && isExpanded && (
                        <div className="ml-6 space-y-1 border-l-2 border-gray-200 pl-2 mt-1">
                          {item.exhibits.map((exhibit) => {
                            const exhibitSelected = selectedExhibits.includes(exhibit._id);
                            
                            // Extract plan type and include/notinclude status from exhibit
                            const planType = exhibit.planType || '';
                            const combination = exhibit.combinations?.[0] || '';
                            const exhibitNameLower = exhibit.name.toLowerCase();
                            const combinationLower = combination.toLowerCase();
                            
                            // Check for "not include" patterns (same logic as docxMerger)
                            const isNotIncluded = combinationLower.includes('not included') || 
                                                  combinationLower.includes('not include') ||
                                                  combinationLower.includes('notincluded') ||
                                                  combinationLower.includes('notinclude') ||
                                                  combinationLower.includes('not-include') ||
                                                  combinationLower.includes('not-included') ||
                                                  exhibitNameLower.includes('not included') ||
                                                  exhibitNameLower.includes('not include') ||
                                                  exhibitNameLower.includes('notincluded') ||
                                                  exhibitNameLower.includes('notinclude') ||
                                                  exhibitNameLower.includes('not-include') ||
                                                  exhibitNameLower.includes('not-included') ||
                                                  exhibitNameLower.includes('not - include') ||
                                                  exhibitNameLower.includes('not - included');
                            const includeStatus = isNotIncluded ? 'Not Include' : 'Include';
                            
                            return (
                              <button
                                key={exhibit._id}
                                type="button"
                                onClick={() => toggleExhibit(exhibit._id, exhibit.isRequired)}
                                disabled={exhibit.isRequired}
                                className={`w-full text-left p-2 rounded-md border transition-all ${
                                  exhibitSelected
                                    ? 'border-purple-400 bg-purple-50'
                                    : 'border-gray-100 bg-gray-50 hover:border-purple-200 hover:bg-purple-50/50'
                                } ${exhibit.isRequired ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-3.5 h-3.5 border-2 flex items-center justify-center flex-shrink-0 ${
                                      exhibitSelected ? 'border-purple-500 bg-purple-500' : 'border-gray-300 bg-white'
                                    }`}
                                  >
                                    {exhibitSelected && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-gray-800 leading-tight">{exhibit.name}</div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {planType && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                                          {planType.charAt(0).toUpperCase() + planType.slice(1)}
                                        </span>
                                      )}
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                        isNotIncluded 
                                          ? 'bg-orange-100 text-orange-700' 
                                          : 'bg-green-100 text-green-700'
                                      }`}>
                                        {includeStatus}
                                      </span>
                                      {exhibit.isRequired && (
                                        <span className="text-[10px] text-purple-600 font-medium">Required</span>
                                      )}
                                    </div>
                                  </div>
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
