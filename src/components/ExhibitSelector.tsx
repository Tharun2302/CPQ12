import React, { useMemo, useState, useEffect } from 'react';
import { Check, ChevronRight, ChevronDown, ArrowRight, Search } from 'lucide-react';
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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

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

  // Filter exhibits based on selected tier (Basic/Standard/Advanced) and search query
  const filteredExhibits = useMemo(() => {
    let filtered = exhibits;

    // First filter by tier if selected
    if (selectedTier?.tier?.name) {
      const tierName = selectedTier.tier.name.toLowerCase();
      
      filtered = filtered.filter(exhibit => {
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
          return false;
        }
        
        // For exhibits without explicit plan type, show them (they're generic)
        return true;
      });
    }

    // Then filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(exhibit => 
        exhibit.name.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [exhibits, selectedTier, searchQuery]);

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
    const requiredExhibitIds = exhibits
      .filter(ex => ex.isRequired)
      .map(ex => ex._id);
    
    onExhibitsChange(requiredExhibitIds);
  };

  const hasAnyExhibits = filteredExhibits.length > 0;
  const totalExhibits = exhibits.length;

  // Get file count for each exhibit (simplified - assuming 1 file per exhibit, can be enhanced)
  const getFileCount = () => {
    // You can enhance this to get actual file count from exhibit data if available
    return 1; // Default to 1 file per exhibit
  };

  // Group exhibits by folder name (base name before " - " or plan type)
  const groupedExhibits = useMemo(() => {
    const groups: Map<string, Exhibit[]> = new Map();
    const ungrouped: Exhibit[] = [];

    filteredExhibits.forEach((exhibit) => {
      // Check if exhibit name contains " - " (dash separator)
      const dashIndex = exhibit.name.indexOf(' - ');
      if (dashIndex > 0) {
        // Extract the base name (e.g., "Slack to Teams Basic Plan" from "Slack to Teams Basic Plan - Included Features")
        const baseName = exhibit.name.substring(0, dashIndex);
        
        // Extract folder name by removing common suffixes like "Basic Plan", "Standard Plan", etc.
        let folderName = baseName
          .replace(/\s+(Basic|Standard|Advanced|Premium|Enterprise)\s+Plan$/i, '')
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
    const groupsArray = Array.from(groups.entries())
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
  }, [filteredExhibits]);

  const toggleFolder = (folderName: string) => {
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

  const toggleFolderSelection = (folderName: string, groupExhibits: Exhibit[]) => {
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

  const getFolderState = (groupExhibits: Exhibit[]) => {
    const selectedCount = groupExhibits.filter(ex => selectedExhibits.includes(ex._id)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === groupExhibits.length) return 'all';
    return 'partial';
  };

  return (
    <div className="w-full">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-6 md:p-8 mb-8 w-full">
        {/* Header Section */}
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-0 mb-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">Search and select migration</h3>
                <p className="text-gray-600 text-xs sm:text-sm">
                  Choose your migration type to configure the project requirements.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleUnselectAll}
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors self-start sm:self-auto"
            >
              Unselect All
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative mb-4 sm:mb-6">
            <Search className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search migration types..."
              className="w-full pl-10 sm:pl-12 pr-4 py-2 sm:py-3 border-2 border-purple-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-gray-900 placeholder-gray-400 text-sm sm:text-base"
            />
          </div>
        </div>

        {/* Exhibits Section */}
        {loading ? (
          <div className="animate-pulse bg-gray-100 rounded-2xl p-6 h-40"></div>
        ) : !hasAnyExhibits ? (
          <div className="p-5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600">
            No exhibits found. {searchQuery ? 'Try a different search query.' : 'Add exhibit DOCX files in <code className="font-mono">CPQ12/backend-exhibits/</code> and restart backend seeding.'}
          </div>
        ) : (
          <div className="bg-purple-50 rounded-2xl border border-purple-200 p-6">
            {/* EXHIBITS Header */}
            <div className="mb-4">
              <div className="inline-block bg-gray-200 h-px w-full mb-3"></div>
              <div className="flex items-center justify-center gap-2">
                <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">EXHIBITS</h4>
                <p className="text-xs text-gray-600">
                  Showing {filteredExhibits.length} of {totalExhibits} exhibits. {filteredExhibits.length < totalExhibits && 'Scroll to view more.'}
                </p>
              </div>
            </div>

            {/* Exhibits List */}
            <div className="bg-white rounded-xl p-4 space-y-1 h-[200px] overflow-y-auto">
              {/* Render grouped exhibits as folders */}
              {groupedExhibits.groups.map((group, groupIndex) => {
                const folderState = getFolderState(group.exhibits);
                const isExpanded = expandedFolders.has(group.folderName);
                const allSelected = folderState === 'all';
                const someSelected = folderState === 'partial';
                const fileCount = group.exhibits.length;

                return (
                  <div key={group.folderName} className="space-y-1">
                    {/* Folder header */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleFolder(group.folderName)}
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
                        onClick={() => toggleFolderSelection(group.folderName, group.exhibits)}
                        className={`flex-1 flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all ${
                          allSelected
                            ? 'bg-purple-600 text-white'
                            : someSelected
                            ? 'bg-purple-100 text-purple-900'
                            : 'bg-white hover:bg-gray-50 text-gray-900'
                        } cursor-pointer border ${
                          allSelected ? 'border-purple-600' : someSelected ? 'border-purple-300' : 'border-gray-200'
                        }`}
                      >
                        {/* Number Badge */}
                        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-xs font-semibold ${
                          allSelected ? 'bg-white text-purple-600' : someSelected ? 'bg-purple-200 text-purple-700' : 'bg-gray-200 text-gray-700'
                        }`}>
                          {groupIndex + 1}
                        </div>

                        {/* Checkbox */}
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          allSelected
                            ? 'border-white bg-white'
                            : someSelected
                            ? 'border-purple-600 bg-white'
                            : 'border-gray-300 bg-white'
                        }`}>
                          {allSelected && <Check className="w-3 h-3 text-purple-600" strokeWidth={3} />}
                          {someSelected && (
                            <div className="w-2 h-2 bg-purple-600 rounded-sm" />
                          )}
                        </div>

                        {/* Folder Name */}
                        <div className="flex-1 text-left">
                          <span className={`font-medium ${allSelected ? 'text-white' : someSelected ? 'text-purple-900' : 'text-gray-900'}`}>
                            {group.folderName}
                          </span>
                          <span className={`ml-2 text-sm ${allSelected ? 'text-purple-100' : someSelected ? 'text-purple-700' : 'text-gray-500'}`}>
                            ({fileCount} {fileCount === 1 ? 'file' : 'files'})
                          </span>
                        </div>
                      </button>
                    </div>
                    
                    {/* Child exhibits (shown when expanded) */}
                    {isExpanded && (
                      <div className="ml-6 space-y-1 pl-2 border-l-2 border-gray-200">
                        {group.exhibits.map((exhibit, childIndex) => {
                          const isSelected = selectedExhibits.includes(exhibit._id);
                          const fileCount = getFileCount();

                          return (
                            <button
                              key={exhibit._id}
                              type="button"
                              onClick={() => toggleExhibit(exhibit._id, exhibit.isRequired)}
                              disabled={exhibit.isRequired}
                              className={`w-full flex items-center gap-2 py-1 px-2 rounded-lg transition-all ${
                                isSelected
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-white hover:bg-gray-50 text-gray-900'
                              } ${exhibit.isRequired ? 'opacity-90 cursor-not-allowed' : 'cursor-pointer'} border ${
                                isSelected ? 'border-purple-600' : 'border-gray-200'
                              }`}
                            >
                              {/* Number Badge */}
                              <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-semibold ${
                                isSelected ? 'bg-white text-purple-600' : 'bg-gray-200 text-gray-700'
                              }`}>
                                {childIndex + 1}
                              </div>

                              {/* Checkbox */}
                              <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                isSelected
                                  ? 'border-white bg-white'
                                  : 'border-gray-300 bg-white'
                              }`}>
                                {isSelected && <Check className="w-2.5 h-2.5 text-purple-600" strokeWidth={3} />}
                              </div>

                              {/* Exhibit Name */}
                              <div className="flex-1 text-left">
                                <span className={`font-medium text-sm ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                                  {exhibit.name.split(' - ')[1] || exhibit.name}
                                </span>
                                <span className={`ml-2 text-xs ${isSelected ? 'text-purple-100' : 'text-gray-500'}`}>
                                  ({fileCount} {fileCount === 1 ? 'file' : 'files'})
                                </span>
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
                const fileCount = getFileCount();
                const exhibitNumber = groupedExhibits.groups.length + ungroupedIndex + 1;

                return (
                  <button
                    key={exhibit._id}
                    type="button"
                    onClick={() => toggleExhibit(exhibit._id, exhibit.isRequired)}
                    disabled={exhibit.isRequired}
                    className={`w-full flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all ${
                      isSelected
                        ? 'bg-purple-600 text-white'
                        : 'bg-white hover:bg-gray-50 text-gray-900'
                    } ${exhibit.isRequired ? 'opacity-90 cursor-not-allowed' : 'cursor-pointer'} border ${
                      isSelected ? 'border-purple-600' : 'border-gray-200'
                    }`}
                  >
                    {/* Arrow Icon */}
                    <ChevronRight className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-white' : 'text-gray-400'}`} />
                    
                    {/* Number Badge */}
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-xs font-semibold ${
                      isSelected ? 'bg-white text-purple-600' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {exhibitNumber}
                    </div>

                    {/* Checkbox */}
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected
                        ? 'border-white bg-white'
                        : 'border-gray-300 bg-white'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-purple-600" strokeWidth={3} />}
                    </div>

                    {/* Exhibit Name */}
                    <div className="flex-1 text-left">
                      <span className={`font-medium ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                        {exhibit.name}
                      </span>
                      <span className={`ml-2 text-sm ${isSelected ? 'text-purple-100' : 'text-gray-500'}`}>
                        ({fileCount} {fileCount === 1 ? 'file' : 'files'})
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExhibitSelector;



