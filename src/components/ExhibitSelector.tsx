import React, { useMemo, useState, useEffect } from 'react';
import { Check, Info, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
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
  combination,
  selectedExhibits,
  onExhibitsChange,
  selectedTier
}) => {
  const [exhibits, setExhibits] = useState<Exhibit[]>([]);
  const [loading, setLoading] = useState(true);

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

  const byCategory = useMemo(() => {
    const normalized = (ex: Exhibit) => (ex.category || 'content').toLowerCase();
    const sorted = [...filteredExhibits].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

    return {
      messaging: sorted.filter((e) => normalized(e) === 'messaging' || normalized(e) === 'message'),
      content: sorted.filter((e) => normalized(e) === 'content'),
      email: sorted.filter((e) => normalized(e) === 'email'),
    };
  }, [filteredExhibits]);

  const toggleExhibit = (exhibitId: string, isRequired: boolean) => {
    if (isRequired) return; // Cannot deselect required exhibits
    
    if (selectedExhibits.includes(exhibitId)) {
      onExhibitsChange(selectedExhibits.filter(id => id !== exhibitId));
    } else {
      onExhibitsChange([...selectedExhibits, exhibitId]);
    }
  };

  const hasAnyExhibits = filteredExhibits.length > 0;

  return (
    <div className="flex justify-center">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 mb-8 w-full max-w-6xl">
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Select exhibits</h3>
          <p className="text-gray-600">
            Exhibits are additional documents (not combinations). Select what you want to append to the end of the agreement.
          </p>
        </div>

      <div className="mb-6 p-4 bg-purple-50 rounded-xl border border-purple-200 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-purple-700">
          All available exhibits are shown below, organized by category (Messaging / Content / Email).
        </p>
      </div>

      {loading ? (
        <div className="animate-pulse bg-gray-100 rounded-2xl p-6 h-40"></div>
      ) : !hasAnyExhibits ? (
        <div className="p-5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600">
          No exhibits found for this combination yet. Add exhibit DOCX files in <code className="font-mono">CPQ12/backend-exhibits/</code> and restart backend seeding.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <CategoryColumn
            title="message"
            exhibits={byCategory.messaging}
            selectedExhibits={selectedExhibits}
            onToggle={toggleExhibit}
            onExhibitsChange={onExhibitsChange}
          />
          <CategoryColumn
            title="content"
            exhibits={byCategory.content}
            selectedExhibits={selectedExhibits}
            onToggle={toggleExhibit}
            onExhibitsChange={onExhibitsChange}
          />
          <CategoryColumn
            title="email"
            exhibits={byCategory.email}
            selectedExhibits={selectedExhibits}
            onToggle={toggleExhibit}
            onExhibitsChange={onExhibitsChange}
          />
        </div>
      )}
      </div>
    </div>
  );
};

export default ExhibitSelector;

// Interface for grouped exhibits
interface ExhibitGroup {
  folderName: string;
  exhibits: Exhibit[];
}

function CategoryColumn({
  title,
  exhibits,
  selectedExhibits,
  onToggle,
  onExhibitsChange,
}: {
  title: string;
  exhibits: Exhibit[];
  selectedExhibits: string[];
  onToggle: (exhibitId: string, isRequired: boolean) => void;
  onExhibitsChange: (exhibitIds: string[]) => void;
}) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Group exhibits by similar names
  const groupedExhibits = useMemo(() => {
    const groups: Map<string, Exhibit[]> = new Map();
    const ungrouped: Exhibit[] = [];

    exhibits.forEach((exhibit) => {
      // Check if exhibit name contains " - " (dash separator)
      const dashIndex = exhibit.name.indexOf(' - ');
      if (dashIndex > 0) {
        // Extract the base name (e.g., "Slack to Teams Basic Plan" from "Slack to Teams Basic Plan - Included Features")
        const baseName = exhibit.name.substring(0, dashIndex);
        
        // Extract folder name by removing common suffixes like "Basic Plan", "Standard Plan", etc.
        let folderName = baseName
          .replace(/\s+(Basic|Standard|Advanced|Premium)\s+Plan$/i, '')
          .trim();
        
        // If folder name is empty or too short, use the base name
        if (!folderName || folderName.length < 3) {
          folderName = baseName;
        }

        if (!groups.has(folderName)) {
          groups.set(folderName, []);
        }
        groups.get(folderName)!.push(exhibit);
      } else {
        // No grouping pattern found, add to ungrouped
        ungrouped.push(exhibit);
      }
    });

    // Convert groups to array and filter out groups with only one exhibit (no need to group)
    const groupsArray: ExhibitGroup[] = Array.from(groups.entries())
      .filter(([_, exhibits]) => exhibits.length > 1)
      .map(([folderName, exhibits]) => ({
        folderName,
        exhibits: exhibits.sort((a, b) => a.name.localeCompare(b.name))
      }));

    // Add single exhibits from groups that were filtered out
    groups.forEach((exhibits, folderName) => {
      if (exhibits.length === 1) {
        ungrouped.push(exhibits[0]);
      }
    });

    return { groups: groupsArray, ungrouped };
  }, [exhibits]);

  const toggleFolder = (folderName: string, groupExhibits: Exhibit[]) => {
    const allSelected = groupExhibits.every(ex => selectedExhibits.includes(ex._id));
    const nonRequiredExhibits = groupExhibits.filter(ex => !ex.isRequired);
    
    if (allSelected) {
      // Deselect all non-required exhibits in the folder
      const newSelection = selectedExhibits.filter(id => 
        !nonRequiredExhibits.some(ex => ex._id === id)
      );
      onExhibitsChange(newSelection);
    } else {
      // Select all non-required exhibits in the folder
      const newIds = nonRequiredExhibits
        .filter(ex => !selectedExhibits.includes(ex._id))
        .map(ex => ex._id);
      if (newIds.length > 0) {
        onExhibitsChange([...selectedExhibits, ...newIds]);
      }
    }
  };

  const toggleFolderExpansion = (folderName: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderName)) {
        newSet.delete(folderName);
      } else {
        newSet.add(folderName);
      }
      return newSet;
    });
  };

  // Helper to check folder selection state
  const getFolderState = (groupExhibits: Exhibit[]) => {
    const selectedCount = groupExhibits.filter(ex => selectedExhibits.includes(ex._id)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === groupExhibits.length) return 'all';
    return 'partial';
  };

  return (
    <div className="border-2 border-black/80 rounded-md overflow-hidden bg-white">
      <div className="border-b-2 border-black/80 py-3 px-4 text-center font-semibold tracking-wide uppercase text-sm">
        {title}
      </div>
      <div 
        className="exhibit-scroll-container max-h-[380px] overflow-y-auto p-4 space-y-3" 
        style={{ 
          scrollbarWidth: 'thin', 
          scrollbarColor: '#9ca3af #f3f4f6',
        }}
      >
        {exhibits.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-10">No exhibits</div>
        ) : (
          <>
            {/* Render grouped exhibits as folders */}
            {groupedExhibits.groups.map((group, groupIndex) => {
              const folderState = getFolderState(group.exhibits);
              const isExpanded = expandedFolders.has(group.folderName);
              const allSelected = folderState === 'all';
              const someSelected = folderState === 'partial';

              return (
                <div key={group.folderName} className="space-y-1">
                  {/* Folder header */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleFolderExpansion(group.folderName)}
                      className="flex-shrink-0 p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-600" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-600" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFolder(group.folderName, group.exhibits)}
                      className={`flex-1 text-left p-2 rounded-lg border transition-all ${
                        allSelected
                          ? 'border-purple-500 bg-purple-50'
                          : someSelected
                          ? 'border-purple-300 bg-purple-25'
                          : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                      } cursor-pointer`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-white border border-gray-300 rounded flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-gray-700">{groupIndex + 1}</span>
                        </div>
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            allSelected
                              ? 'border-purple-500 bg-purple-500'
                              : someSelected
                              ? 'border-purple-500 bg-white'
                              : 'border-gray-300 bg-white'
                          }`}
                        >
                          {allSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                          {someSelected && (
                            <div className="w-2 h-2 bg-purple-500 rounded-sm" />
                          )}
                        </div>
                        <div className="font-semibold text-gray-900 text-sm">{group.folderName}</div>
                        <span className="text-xs text-gray-500">({group.exhibits.length} files)</span>
                      </div>
                    </button>
                  </div>
                  
                  {/* Child exhibits (shown when expanded) */}
                  {isExpanded && (
                    <div className="ml-6 space-y-1 pl-2 border-l-2 border-gray-200">
                      {group.exhibits.map((exhibit, childIndex) => {
                        const isSelected = selectedExhibits.includes(exhibit._id);
                        const isRequired = exhibit.isRequired;

                        return (
                          <button
                            key={exhibit._id}
                            type="button"
                            onClick={() => onToggle(exhibit._id, isRequired)}
                            disabled={isRequired}
                            className={`w-full text-left p-2 rounded-lg border transition-all ${
                              isSelected
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                            } ${isRequired ? 'opacity-90 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <div className="flex items-start gap-2">
                              <div className="w-4 h-4 bg-white border border-gray-300 rounded flex items-center justify-center flex-shrink-0">
                                <span className="text-[10px] font-semibold text-gray-700">{childIndex + 1}</span>
                              </div>
                              <div
                                className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                  isSelected ? 'border-purple-500 bg-purple-500' : 'border-gray-300 bg-white'
                                }`}
                              >
                                {isSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="font-medium text-gray-800 text-xs">
                                    {exhibit.name.split(' - ')[1] || exhibit.name}
                                  </div>
                                  {isRequired && (
                                    <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">
                                      Required
                                    </span>
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
            })}

            {/* Render ungrouped exhibits */}
            {groupedExhibits.ungrouped.map((exhibit, ungroupedIndex) => {
              const isSelected = selectedExhibits.includes(exhibit._id);
              const isRequired = exhibit.isRequired;
              const exhibitNumber = groupedExhibits.groups.length + ungroupedIndex + 1;

              return (
                <button
                  key={exhibit._id}
                  type="button"
                  onClick={() => onToggle(exhibit._id, isRequired)}
                  disabled={isRequired}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                  } ${isRequired ? 'opacity-90 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 bg-white border border-gray-300 rounded flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-gray-700">{exhibitNumber}</span>
                    </div>
                    <div
                      className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'border-purple-500 bg-purple-500' : 'border-gray-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-gray-900 text-sm">{exhibit.name}</div>
                        {isRequired && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                            Required
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}



