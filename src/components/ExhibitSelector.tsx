import React, { useMemo, useState, useEffect } from 'react';
import { FileText, Check, Info, Sparkles } from 'lucide-react';
import { BACKEND_URL } from '../config/api';

interface Exhibit {
  _id: string;
  name: string;
  description: string;
  fileName: string;
  combinations: string[];
  category?: string;
  exhibitType?: 'included' | 'excluded' | 'general';
  isRequired: boolean;
  displayOrder: number;
}

interface ExhibitSelectorProps {
  combination: string;
  selectedExhibits: string[];
  onExhibitsChange: (exhibitIds: string[]) => void;
}

const ExhibitSelector: React.FC<ExhibitSelectorProps> = ({
  combination,
  selectedExhibits,
  onExhibitsChange
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

  const byCategory = useMemo(() => {
    const normalized = (ex: Exhibit) => (ex.category || 'content').toLowerCase();
    const sorted = [...exhibits].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

    return {
      messaging: sorted.filter((e) => normalized(e) === 'messaging' || normalized(e) === 'message'),
      content: sorted.filter((e) => normalized(e) === 'content'),
      email: sorted.filter((e) => normalized(e) === 'email'),
    };
  }, [exhibits]);

  const toggleExhibit = (exhibitId: string, isRequired: boolean) => {
    if (isRequired) return; // Cannot deselect required exhibits
    
    if (selectedExhibits.includes(exhibitId)) {
      onExhibitsChange(selectedExhibits.filter(id => id !== exhibitId));
    } else {
      onExhibitsChange([...selectedExhibits, exhibitId]);
    }
  };

  const hasAnyExhibits = exhibits.length > 0;

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 mb-8">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl shadow-lg mb-4">
          <FileText className="w-8 h-8 text-white" />
        </div>
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
          />
          <CategoryColumn
            title="content"
            exhibits={byCategory.content}
            selectedExhibits={selectedExhibits}
            onToggle={toggleExhibit}
          />
          <CategoryColumn
            title="email"
            exhibits={byCategory.email}
            selectedExhibits={selectedExhibits}
            onToggle={toggleExhibit}
          />
        </div>
      )}
    </div>
  );
};

export default ExhibitSelector;

function CategoryColumn({
  title,
  exhibits,
  selectedExhibits,
  onToggle,
}: {
  title: string;
  exhibits: Exhibit[];
  selectedExhibits: string[];
  onToggle: (exhibitId: string, isRequired: boolean) => void;
}) {
  return (
    <div className="border-2 border-black/80 rounded-md overflow-hidden bg-white">
      <div className="border-b-2 border-black/80 py-3 px-4 text-center font-semibold tracking-wide uppercase text-sm">
        {title}
      </div>
      <div className="min-h-[260px] p-4 space-y-3">
        {exhibits.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-10">No exhibits</div>
        ) : (
          exhibits.map((exhibit) => {
            const isSelected = selectedExhibits.includes(exhibit._id);
            const isRequired = exhibit.isRequired;

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
                      {exhibit.exhibitType === 'included' && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          ✓ Included
                        </span>
                      )}
                      {exhibit.exhibitType === 'excluded' && (
                        <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                          ⊗ Not Included
                        </span>
                      )}
                      {isRequired && (
                        <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                          Required
                        </span>
                      )}
                    </div>
                    {/* Description and auto-included note intentionally hidden */}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}



