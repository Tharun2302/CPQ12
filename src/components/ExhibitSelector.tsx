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
      const exhibitName = exhibit.name.toLowerCase();
      
      // Check if exhibit name contains a plan type (Standard, Advanced, Basic, Premium, Enterprise)
      const hasStandard = exhibitName.includes('standard');
      const hasAdvanced = exhibitName.includes('advanced');
      const hasBasic = exhibitName.includes('basic');
      const hasPremium = exhibitName.includes('premium');
      const hasEnterprise = exhibitName.includes('enterprise');
      
      // If exhibit has a plan type, filter by matching tier
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

  // Process exhibits for flat list display (handle grouping)
  const processedExhibits = useMemo(() => {
    const sorted = [...searchFilteredExhibits].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    
    // Group exhibits by base name (for items with " - " separator)
    const groups: Map<string, Exhibit[]> = new Map();
    const ungrouped: Exhibit[] = [];
    
    sorted.forEach((exhibit) => {
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
                    <button
                      key={item.id}
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
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
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

