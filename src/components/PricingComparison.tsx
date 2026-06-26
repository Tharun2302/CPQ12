import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle } from 'lucide-react';
import { PricingCalculation, ConfigurationData, PricingTier } from '../types/pricing';
import { formatCurrency, PRICING_TIERS, calculateCombinationPricing, getManageDataRatePerGB } from '../utils/pricing';

interface PricingComparisonProps {
  calculations: PricingCalculation[];
  recommendedTier: PricingCalculation;
  onSelectTier: (calculation: PricingCalculation) => void;
  configuration?: ConfigurationData;
  selectedTier?: PricingCalculation | null; // Add selectedTier prop to know which plan is selected
  templates?: any[]; // Templates to check if plan has corresponding template
}

const PricingComparison: React.FC<PricingComparisonProps> = ({
  calculations,
  onSelectTier,
  configuration,
  selectedTier,
  templates = []
}) => {
  const [discount, setDiscount] = useState<number>(0);

  // EXHIBIT plan per combination (key: combinationName, value: plan name). This drives which
  // plan's EXHIBITS each combination pulls into the agreement — independent of pricing.
  // Load from sessionStorage on mount to persist across navigation.
  const [selectedTiersPerCombination, setSelectedTiersPerCombination] = useState<Record<string, 'Basic' | 'Standard' | 'Advanced'>>(() => {
    try {
      const saved = sessionStorage.getItem('cpq_selected_tiers_per_combination');
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('📋 Restored per-combination exhibit plans:', parsed);
        return parsed;
      }
    } catch (e) {
      console.warn('Could not load per-combination exhibit plans:', e);
    }
    return {};
  });

  // Save per-combination exhibit plans to sessionStorage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem('cpq_selected_tiers_per_combination', JSON.stringify(selectedTiersPerCombination));
      console.log('💾 Saved per-combination exhibit plans:', selectedTiersPerCombination);
    } catch (e) {
      console.warn('Could not save per-combination exhibit plans:', e);
    }
  }, [selectedTiersPerCombination]);

  // GLOBAL pricing plan: the single plan used to price the WHOLE quote (same for all
  // combinations). Independent of the per-combination exhibit plans above.
  const [pricingPlan, setPricingPlan] = useState<'Basic' | 'Standard' | 'Advanced'>(() => {
    try {
      const saved = sessionStorage.getItem('cpq_pricing_plan');
      if (saved === 'Basic' || saved === 'Standard' || saved === 'Advanced') return saved;
    } catch (e) {
      console.warn('Could not load pricing plan:', e);
    }
    return 'Standard';
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('cpq_pricing_plan', pricingPlan);
    } catch (e) {
      console.warn('Could not save pricing plan:', e);
    }
  }, [pricingPlan]);

  // Initialize each combination's plan to Standard by default, preserving any plan already
  // chosen (each combination keeps its own plan — mixing is allowed).
  useEffect(() => {
    if (configuration?.migrationType === 'Multi combination' && calculations.length > 0) {
      const allNames: string[] = [];
      calculations[0]?.messagingCombinationBreakdowns?.forEach(b => allNames.push(b.combinationName));
      calculations[0]?.contentCombinationBreakdowns?.forEach(b => allNames.push(b.combinationName));
      calculations[0]?.emailCombinationBreakdowns?.forEach(b => allNames.push(b.combinationName));
      if (allNames.length === 0) return;

      setSelectedTiersPerCombination(prev => {
        // Only fill in combinations that have no plan yet; never overwrite a user's choice.
        const missing = allNames.filter(n => !prev[n]);
        if (missing.length === 0) return prev;
        const updated = { ...prev };
        missing.forEach(n => { updated[n] = 'Standard'; });
        return updated;
      });
    }
  }, [calculations, configuration]);

  // Calculate custom total — ALL combinations are priced at the single GLOBAL pricing plan
  // (per-combination exhibit plans do NOT affect pricing).
  const customTotal = useMemo(() => {
    if (!configuration || configuration.migrationType !== 'Multi combination') {
      return null;
    }

    const pricingTier = PRICING_TIERS.find(t => t.name === pricingPlan) || PRICING_TIERS[1];
    let total = 0;
    const breakdown: Array<{ combinationName: string; tier: string; cost: number; type: string }> = [];

    // Calculate messaging combinations
    if (configuration.messagingConfigs && configuration.messagingConfigs.length > 0) {
      configuration.messagingConfigs.forEach(cfg => {
        const pricing = calculateCombinationPricing(cfg.exhibitName, 'messaging', configuration, pricingTier);
        total += pricing.totalCost;
        breakdown.push({
          combinationName: cfg.exhibitName,
          tier: pricingPlan,
          cost: pricing.totalCost,
          type: 'messaging'
        });
      });
    }
    
    // Calculate content combinations
    if (configuration.contentConfigs && configuration.contentConfigs.length > 0) {
      configuration.contentConfigs.forEach(cfg => {
        const pricing = calculateCombinationPricing(cfg.exhibitName, 'content', configuration, pricingTier);
        total += pricing.totalCost;
        breakdown.push({
          combinationName: cfg.exhibitName,
          tier: pricingPlan,
          cost: pricing.totalCost,
          type: 'content'
        });
      });
    }
    
    // Calculate email combinations
    if (configuration.emailConfigs && configuration.emailConfigs.length > 0) {
      configuration.emailConfigs.forEach(cfg => {
        const pricing = calculateCombinationPricing(cfg.exhibitName, 'email', configuration, pricingTier);
        total += pricing.totalCost;
        breakdown.push({
          combinationName: cfg.exhibitName,
          tier: pricingPlan,
          cost: pricing.totalCost,
          type: 'email'
        });
      });
    }
    
    // Debug logging
    console.log('🔧 Custom Total Calculation:', {
      breakdown,
      total,
      pricingPlan,
      exhibitPlans: selectedTiersPerCombination
    });

    return total;
  }, [configuration, pricingPlan]);

  // Each combination keeps its OWN plan (mixing allowed). Setting the plan applies it to the
  // currently selected combination only.
  const setTierForCombination = (combinationName: string, newTier: 'Basic' | 'Standard' | 'Advanced') => {
    setSelectedTiersPerCombination(prev => ({ ...prev, [combinationName]: newTier }));
  };

  // Flat list of every combination (across messaging/content/email) for the combination filter.
  const allCombinations = useMemo(() => ([
    ...((calculations[0]?.messagingCombinationBreakdowns || []).map(b => ({ type: 'messaging' as const, label: 'Messaging', name: b.combinationName, breakdown: b }))),
    ...((calculations[0]?.contentCombinationBreakdowns || []).map(b => ({ type: 'content' as const, label: 'Content', name: b.combinationName, breakdown: b }))),
    ...((calculations[0]?.emailCombinationBreakdowns || []).map(b => ({ type: 'email' as const, label: 'Email', name: b.combinationName, breakdown: b }))),
  ]), [calculations]);

  // Which combination is currently selected in the combination filter.
  const [selectedCombinationView, setSelectedCombinationView] = useState<string>('');
  const activeCombination =
    allCombinations.find(c => c.name === selectedCombinationView) || allCombinations[0];

  // The EXHIBIT plan of the currently selected combination (defaults to Standard).
  const activeCombinationPlan: 'Basic' | 'Standard' | 'Advanced' =
    (activeCombination && selectedTiersPerCombination[activeCombination.name]) || 'Standard';

  // The global pricing tier object (used to price each combination's contribution).
  const pricingTierObj = PRICING_TIERS.find(t => t.name === pricingPlan) || PRICING_TIERS[1];

  // Get pricing for a specific combination with selected tier
  const getCombinationPricing = (
    combinationName: string,
    combinationType: 'messaging' | 'content' | 'email',
    defaultBreakdown: { numberOfUsers?: number; userCost: number; dataCost: number; migrationCost: number; instanceCost: number; totalCost: number },
    planTier?: PricingTier // The tier of the current plan column being displayed
  ) => {
    if (!configuration || configuration.migrationType !== 'Multi combination') {
      return defaultBreakdown;
    }

    // If planTier is provided, use it for comparison view (each column shows its own tier)
    // Otherwise, use selectedTier for custom total calculation
    const tierToUse = planTier || PRICING_TIERS.find(t => t.name === selectedTiersPerCombination[combinationName] || 'Standard');
    
    if (!tierToUse) {
      return defaultBreakdown;
    }
    
    const pricing = calculateCombinationPricing(combinationName, combinationType, configuration, tierToUse);
    return pricing;
  };

  // Read discount from sessionStorage (set in Configuration session)
  useEffect(() => {
    const loadDiscount = () => {
      try {
        const savedDiscount = sessionStorage.getItem('cpq_discount_session');
        if (savedDiscount !== null && savedDiscount !== '' && !isNaN(Number(savedDiscount))) {
          setDiscount(Number(savedDiscount));
        } else {
          setDiscount(0);
        }
      } catch {
        setDiscount(0);
      }
    };

    // Load initial discount
    loadDiscount();

    // Listen for storage events (changes from other components)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cpq_discount_session') {
        loadDiscount();
      }
    };

    // Listen for custom events (immediate updates from same page)
    const handleDiscountUpdate = () => {
      loadDiscount();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('discountUpdated', handleDiscountUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('discountUpdated', handleDiscountUpdate);
    };
  }, []);

  // Filter plans: only Basic and Standard are shown (Advanced is retained in PRICING_TIERS
  // for any backend templates still referencing it, but never surfaced in the UI).
  const filteredCalculations = calculations.filter(calc => {
    // Debug logging for slack-to-google-chat
    if (configuration?.combination === 'slack-to-google-chat') {
      console.log('🔍 PricingComparison filter - slack-to-google-chat:', {
        totalCalculations: calculations.length,
        calculationTiers: calculations.map(c => c.tier.name),
        currentCalcTier: calc.tier.name,
        combination: configuration.combination
      });
    }

    // For overage agreement, show only ONE plan (first available)
    // Check both combination AND migrationType to handle case where combination isn't set yet
    if (
      configuration?.combination === 'overage-agreement' ||
      configuration?.migrationType === 'Overage Agreement'
    ) {
      return calc === calculations[0];
    }

    // Manage Standalone: tier-agnostic, show only ONE plan card
    if (configuration?.servicePlan === 'Manage') {
      return calc === calculations[0];
    }

    // Hard rule: never show Advanced
    if (calc.tier.name === 'Advanced') return false;

    // Show only Basic and Standard for every combination — combination-specific
    // hideBasicPlan / hideStandardPlan rules and the per-template-existence guard
    // were removed so Basic + Standard always appear for the selected combination.
    return calc.tier.name === 'Basic' || calc.tier.name === 'Standard';
  });
  
  // Debug logging after filtering
  useEffect(() => {
    if (configuration?.combination === 'slack-to-teams' || configuration?.combination === 'slack-to-google-chat') {
      console.log('🔍 PricingComparison - After filtering:', {
        combination: configuration.combination,
        originalCount: calculations.length,
        filteredCount: filteredCalculations.length,
        originalTiers: calculations.map(c => c.tier.name),
        filteredTiers: filteredCalculations.map(c => c.tier.name),
        availableTemplates: templates?.filter(t => {
          const tc = (t?.combination || '').toLowerCase();
          return tc === (configuration?.combination || '').toLowerCase();
        }).map(t => ({ name: t.name, planType: t.planType })) || []
      });
    }
  }, [calculations, filteredCalculations, configuration?.combination, templates]);

  // Helper function to apply discount calculations
  const calculateDiscountedPrice = (totalCost: number) => {
    const isDiscountValid = discount > 0;

    if (isDiscountValid) {
      const discountAmount = totalCost * (discount / 100);
      const finalTotal = totalCost - discountAmount;
      return {
        originalPrice: totalCost,
        discountAmount,
        finalPrice: finalTotal,
        hasDiscount: true,
        discountPercent: discount
      };
    }
    
    return {
      originalPrice: totalCost,
      discountAmount: 0,
      finalPrice: totalCost,
      hasDiscount: false,
      discountPercent: 0
    };
  };

  // Determine the appropriate container class based on the number of filtered plans
  let containerClass = '';
  if (filteredCalculations.length === 1) {
    containerClass = 'flex justify-center';
  } else if (filteredCalculations.length === 2) {
    containerClass = 'flex flex-col md:flex-row justify-center items-center gap-8';
  } else if (filteredCalculations.length === 3) {
    containerClass = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8';
  }

  // Debug logging for overage agreement
  if (configuration?.combination === 'overage-agreement') {
    console.log('📋 OVERAGE AGREEMENT Display:', {
      combination: configuration.combination,
      filteredPlansCount: filteredCalculations.length,
      plans: filteredCalculations.map(c => ({
        name: c.tier.name,
        userCost: c.userCost,
        dataCost: c.dataCost,
        migrationCost: c.migrationCost,
        instanceCost: c.instanceCost,
        totalCost: c.totalCost
      }))
    });
  }

  return (
    <div id="pricing-comparison" className="bg-gradient-to-br from-white via-slate-50/50 to-blue-50/30 rounded-2xl shadow-2xl border border-slate-200/50 p-8 backdrop-blur-sm">
      <div className="text-center mb-10">
        <h2 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent mb-3">
          {(configuration?.combination === 'overage-agreement' || configuration?.migrationType === 'Overage Agreement')
            ? 'Overage Agreement Pricing'
            : configuration?.servicePlan === 'Manage'
            ? 'Your Manage Plan'
            : 'Choose Your Perfect Plan'}
        </h2>
        <p className="text-gray-600 text-lg">
          {(configuration?.combination === 'overage-agreement' || configuration?.migrationType === 'Overage Agreement')
            ? 'Instance costs only - no user or data costs apply'
            : configuration?.servicePlan === 'Manage'
            ? 'Review your Manage plan summary and total cost'
            : 'Compare our pricing tiers and find the best fit for your project'}
        </p>
      </div>
      
      <div className={`${containerClass} max-w-6xl mx-auto`}>
        {filteredCalculations.map((calc) => {
          // For Multi combination, recalculate total based on this plan's tier
          let planTotal = calc.totalCost;
          let originalTotalBeforeMinimum = planTotal;
          let isSingleCombination = false;
          
          if (configuration?.migrationType === 'Multi combination') {
            planTotal = 0;
            
            // Count how many combination types are selected
            const hasMessaging = calc.messagingCombinationBreakdowns && calc.messagingCombinationBreakdowns.length > 0;
            const hasContent = calc.contentCombinationBreakdowns && calc.contentCombinationBreakdowns.length > 0;
            const hasEmail = calc.emailCombinationBreakdowns && calc.emailCombinationBreakdowns.length > 0;
            const combinationCount = (hasMessaging ? 1 : 0) + (hasContent ? 1 : 0) + (hasEmail ? 1 : 0);
            isSingleCombination = combinationCount === 1;
            
            // Sum messaging combinations
            if (hasMessaging) {
              calc.messagingCombinationBreakdowns!.forEach(breakdown => {
                const pricing = getCombinationPricing(breakdown.combinationName, 'messaging', breakdown, calc.tier);
                planTotal += pricing.totalCost;
              });
            }
            
            // Sum content combinations
            if (hasContent) {
              calc.contentCombinationBreakdowns!.forEach(breakdown => {
                const pricing = getCombinationPricing(breakdown.combinationName, 'content', breakdown, calc.tier);
                planTotal += pricing.totalCost;
              });
            }
            
            // Sum email combinations
            if (hasEmail) {
              calc.emailCombinationBreakdowns!.forEach(breakdown => {
                const pricing = getCombinationPricing(breakdown.combinationName, 'email', breakdown, calc.tier);
                planTotal += pricing.totalCost;
              });
            }
            
            originalTotalBeforeMinimum = planTotal;
            
          }
          
          const discountInfo = calculateDiscountedPrice(planTotal);
          // Check if this plan is currently selected
          const isSelected = selectedTier?.tier?.name === calc.tier.name;
          
          return (
            <div
              key={calc.tier.id}
              className={`relative rounded-2xl border-2 p-8 transition-all duration-500 hover:shadow-2xl transform hover:-translate-y-2 ${
                isSelected
                  ? 'border-blue-500 bg-blue-50/50 shadow-lg' // Highlight selected plan
                  : 'border-gray-200 bg-white hover:border-blue-300'
              } ${
                filteredCalculations.length === 2 ? 'w-full max-w-sm' : 'w-full max-w-sm'
              }`}
            >

              <div className="text-center mb-6">
                {/* Selected indicator */}
                {isSelected && (
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-600">Selected</span>
                  </div>
                )}
                {/* Special heading for overage agreement */}
                {(configuration?.combination === 'overage-agreement' || configuration?.migrationType === 'Overage Agreement') ? (
                  <h3 className={`text-2xl font-bold mb-3 ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>
                    Overage Agreement
                  </h3>
                ) : configuration?.servicePlan === 'Manage' ? (
                  <h3 className={`text-2xl font-bold mb-3 ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>
                    Manage
                  </h3>
                ) : (
                  <h3 className={`text-2xl font-bold mb-3 ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>
                    {calc.tier.name}
                  </h3>
                )}
                {calc.status === 'custom' ? (
                  <div>
                    <div className="text-3xl font-bold mb-2 text-amber-700">Custom</div>
                    <div className="text-sm text-gray-600 font-medium">Contact sales for a quote</div>
                  </div>
                ) : discountInfo.hasDiscount ? (
                  <div>
                    <div className="text-2xl text-gray-500 line-through mb-1">
                      {formatCurrency(discountInfo.originalPrice)}
                    </div>
                    <div className="text-4xl font-bold mb-2 text-green-600">
                      {formatCurrency(discountInfo.finalPrice)}
                    </div>
                    <div className="text-sm text-green-600 font-medium mb-1">
                      Save {formatCurrency(discountInfo.discountAmount)} ({discountInfo.discountPercent}% off)
                    </div>
                    <div className="text-sm text-gray-600 font-medium">Total project cost</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-4xl font-bold mb-2 text-gray-900">
                      {formatCurrency(planTotal)}
                    </div>
                    <div className="text-sm text-gray-600 font-medium">Total project cost</div>
                  </div>
                )}
              </div>

              <div className="space-y-4 mb-8">
                {/* For MULTI COMBINATION: Show separate Messaging + Content breakdowns */}
                {configuration?.migrationType === 'Multi combination' && (calc.messagingCalculation || calc.contentCalculation) ? (
                  <>
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-lg p-4 mb-4">
                      <p className="text-sm text-purple-800 font-bold text-center">
                        🔀 Combination Pricing Breakdown
                      </p>
                    </div>

                    {/* Messaging Section - show individual combinations if available */}
                    {calc.messagingCalculation && (
                      calc.messagingCombinationBreakdowns && calc.messagingCombinationBreakdowns.length > 0 ? (
                        // Show individual breakdowns for each combination
                        calc.messagingCombinationBreakdowns.map((breakdown, idx) => {
                          // Use the current plan column's tier for pricing display (for comparison)
                          const pricing = getCombinationPricing(breakdown.combinationName, 'messaging', breakdown, calc.tier);
                          const combinationUsers =
                            breakdown.numberOfUsers ??
                            configuration?.messagingConfigs?.find(c => c.exhibitName === breakdown.combinationName)?.numberOfUsers ??
                            0;
                          
                          return (
                            <div key={idx} className="border-2 border-teal-200 bg-teal-50/50 rounded-lg p-4 mb-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-bold text-teal-900 flex items-center gap-2">
                                  <span className="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center text-white text-xs">M</span>
                                  Messaging Migration – {breakdown.combinationName}
                                </h4>
                                <div className="px-3 py-1.5 border border-teal-300 rounded-lg bg-teal-100 text-sm font-medium text-teal-900">
                                  {calc.tier.name} Plan
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-gray-700">User Cost:</span>
                                  <span className="font-bold text-gray-900">{formatCurrency(pricing.userCost)}</span>
                                </div>
                                {combinationUsers > 0 && (
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-700">Per user cost:</span>
                                    <span className="font-bold text-gray-900">
                                      {`${formatCurrency(pricing.userCost / combinationUsers)}/user`}
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-gray-700">Migration Cost:</span>
                                  <span className="font-bold text-gray-900">{formatCurrency(pricing.migrationCost)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-gray-700">Instance Cost:</span>
                                  <span className="font-bold text-gray-900">{formatCurrency(pricing.instanceCost)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm bg-teal-100 rounded p-2 mt-2">
                                  <span className="font-bold text-teal-900">Messaging Total ({breakdown.combinationName}):</span>
                                  <span className="font-bold text-teal-900">{formatCurrency(pricing.totalCost)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        // Fallback: show aggregated total if per-combination breakdowns not available
                        <div className="border-2 border-teal-200 bg-teal-50/50 rounded-lg p-4 mb-4">
                          <h4 className="font-bold text-teal-900 mb-3 flex items-center gap-2">
                            <span className="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center text-white text-xs">M</span>
                            Messaging Migration
                          </h4>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-700">User Cost:</span>
                              <span className="font-bold text-gray-900">{formatCurrency(calc.messagingCalculation.userCost)}</span>
                            </div>
                            {(configuration?.messagingConfigs?.length || 0) > 0 && (
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-700">Per user cost:</span>
                                <span className="font-bold text-gray-900">
                                  {`${formatCurrency(
                                    calc.messagingCalculation.userCost /
                                      ((configuration?.messagingConfigs || []).reduce((acc, c) => acc + (c.numberOfUsers || 0), 0) || 1)
                                  )}/user`}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-700">Migration Cost:</span>
                              <span className="font-bold text-gray-900">{formatCurrency(calc.messagingCalculation.migrationCost)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-700">Instance Cost:</span>
                              <span className="font-bold text-gray-900">{formatCurrency(calc.messagingCalculation.instanceCost)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm bg-teal-100 rounded p-2 mt-2">
                              <span className="font-bold text-teal-900">Messaging Total:</span>
                              <span className="font-bold text-teal-900">{formatCurrency(calc.messagingCalculation.totalCost)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    )}

                    {/* Content Section - show individual combinations if available */}
                    {calc.contentCalculation && (
                      calc.contentCombinationBreakdowns && calc.contentCombinationBreakdowns.length > 0 ? (
                        // Show individual breakdowns for each combination
                        calc.contentCombinationBreakdowns.map((breakdown, idx) => {
                          // Use the current plan column's tier for pricing display (for comparison)
                          const pricing = getCombinationPricing(breakdown.combinationName, 'content', breakdown, calc.tier);
                          const combinationUsers =
                            breakdown.numberOfUsers ??
                            configuration?.contentConfigs?.find(c => c.exhibitName === breakdown.combinationName)?.numberOfUsers ??
                            0;
                          
                          return (
                            <div key={idx} className="border-2 border-indigo-200 bg-indigo-50/50 rounded-lg p-4 mb-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-bold text-indigo-900 flex items-center gap-2">
                                  <span className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xs">C</span>
                                  Content Migration – {breakdown.combinationName}
                                </h4>
                                <div className="px-3 py-1.5 border border-indigo-300 rounded-lg bg-indigo-100 text-sm font-medium text-indigo-900">
                                  {calc.tier.name} Plan
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-gray-700">User Cost:</span>
                                  <span className="font-bold text-gray-900">{formatCurrency(pricing.userCost)}</span>
                                </div>
                                {combinationUsers > 0 && (
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-700">Per user cost:</span>
                                    <span className="font-bold text-gray-900">
                                      {`${formatCurrency(pricing.userCost / combinationUsers)}/user`}
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-gray-700">Data Cost:</span>
                                  <span className="font-bold text-gray-900">{formatCurrency(pricing.dataCost)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-gray-700">Migration Cost:</span>
                                  <span className="font-bold text-gray-900">{formatCurrency(pricing.migrationCost)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-gray-700">Instance Cost:</span>
                                  <span className="font-bold text-gray-900">{formatCurrency(pricing.instanceCost)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm bg-indigo-100 rounded p-2 mt-2">
                                  <span className="font-bold text-indigo-900">Content Total ({breakdown.combinationName}):</span>
                                  <span className="font-bold text-indigo-900">{formatCurrency(pricing.totalCost)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        // Fallback: show aggregated total if per-combination breakdowns not available
                        <div className="border-2 border-indigo-200 bg-indigo-50/50 rounded-lg p-4 mb-4">
                          <h4 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
                            <span className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xs">C</span>
                            Content Migration
                          </h4>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-700">User Cost:</span>
                              <span className="font-bold text-gray-900">{formatCurrency(calc.contentCalculation.userCost)}</span>
                            </div>
                            {(configuration?.contentConfigs?.length || 0) > 0 && (
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-700">Per user cost:</span>
                                <span className="font-bold text-gray-900">
                                  {`${formatCurrency(
                                    calc.contentCalculation.userCost /
                                      ((configuration?.contentConfigs || []).reduce((acc, c) => acc + (c.numberOfUsers || 0), 0) || 1)
                                  )}/user`}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-700">Data Cost:</span>
                              <span className="font-bold text-gray-900">{formatCurrency(calc.contentCalculation.dataCost)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-700">Migration Cost:</span>
                              <span className="font-bold text-gray-900">{formatCurrency(calc.contentCalculation.migrationCost)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-700">Instance Cost:</span>
                              <span className="font-bold text-gray-900">{formatCurrency(calc.contentCalculation.instanceCost)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm bg-indigo-100 rounded p-2 mt-2">
                              <span className="font-bold text-indigo-900">Content Total:</span>
                              <span className="font-bold text-indigo-900">{formatCurrency(calc.contentCalculation.totalCost)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    )}

                    {/* Email Section - show individual combinations if available */}
                    {calc.emailCalculation && (
                      calc.emailCombinationBreakdowns && calc.emailCombinationBreakdowns.length > 0 ? (
                        // Show individual breakdowns for each combination
                        calc.emailCombinationBreakdowns.map((breakdown, idx) => {
                          // Use the current plan column's tier for pricing display (for comparison)
                          const pricing = getCombinationPricing(breakdown.combinationName, 'email', breakdown, calc.tier);
                          const combinationUsers =
                            breakdown.numberOfUsers ??
                            configuration?.emailConfigs?.find(c => c.exhibitName === breakdown.combinationName)?.numberOfUsers ??
                            0;
                          
                          return (
                            <div key={idx} className="border-2 border-amber-200 bg-amber-50/50 rounded-lg p-4 mb-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-bold text-amber-900 flex items-center gap-2">
                                  <span className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center text-white text-xs">E</span>
                                  Email Migration – {breakdown.combinationName}
                                </h4>
                                <div className="px-3 py-1.5 border border-amber-300 rounded-lg bg-amber-100 text-sm font-medium text-amber-900">
                                  {calc.tier.name} Plan
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-gray-700">User Cost:</span>
                                  <span className="font-bold text-gray-900">{formatCurrency(pricing.userCost)}</span>
                                </div>
                                {combinationUsers > 0 && (
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-700">Per user cost:</span>
                                    <span className="font-bold text-gray-900">
                                      {`${formatCurrency(pricing.userCost / combinationUsers)}/user`}
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-gray-700">Migration Cost:</span>
                                  <span className="font-bold text-gray-900">{formatCurrency(pricing.migrationCost)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-gray-700">Instance Cost:</span>
                                  <span className="font-bold text-gray-900">{formatCurrency(pricing.instanceCost)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm bg-amber-100 rounded p-2 mt-2">
                                  <span className="font-bold text-amber-900">Email Total ({breakdown.combinationName}):</span>
                                  <span className="font-bold text-amber-900">{formatCurrency(pricing.totalCost)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        // Fallback: show aggregated total if per-combination breakdowns not available
                        <div className="border-2 border-amber-200 bg-amber-50/50 rounded-lg p-4 mb-4">
                          <h4 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                            <span className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center text-white text-xs">E</span>
                            Email Migration
                          </h4>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-700">User Cost:</span>
                              <span className="font-bold text-gray-900">{formatCurrency(calc.emailCalculation.userCost)}</span>
                            </div>
                            {(configuration?.emailConfigs?.length || 0) > 0 && (
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-700">Per user cost:</span>
                                <span className="font-bold text-gray-900">
                                  {`${formatCurrency(
                                    calc.emailCalculation.userCost /
                                      ((configuration?.emailConfigs || []).reduce((acc, c) => acc + (c.numberOfUsers || 0), 0) || 1)
                                  )}/user`}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-700">Migration Cost:</span>
                              <span className="font-bold text-gray-900">{formatCurrency(calc.emailCalculation.migrationCost)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-700">Instance Cost:</span>
                              <span className="font-bold text-gray-900">{formatCurrency(calc.emailCalculation.instanceCost)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm bg-amber-100 rounded p-2 mt-2">
                              <span className="font-bold text-amber-900">Email Total:</span>
                              <span className="font-bold text-amber-900">{formatCurrency(calc.emailCalculation.totalCost)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    )}

                  </>
                ) : configuration?.combination === 'overage-agreement' || configuration?.migrationType === 'Overage Agreement' ? (
                  <>
                    <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                      <span className="text-gray-700 font-medium">Instance Type:</span>
                      <span className="font-bold text-gray-900">{configuration?.instanceType}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                      <span className="text-gray-700 font-medium">Number of Instances:</span>
                      <span className="font-bold text-gray-900">{configuration?.numberOfInstances}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                      <span className="text-gray-700 font-medium">Duration (Months):</span>
                      <span className="font-bold text-gray-900">{configuration?.duration}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <span className="text-gray-900 font-bold">Total Instance Cost:</span>
                      <span className="font-bold text-2xl text-purple-700">{formatCurrency(calc.instanceCost)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Per-user cost and User costs — hidden for Manage agreements without a users field */}
                    {configuration?.servicePlan !== 'Manage' || configuration?.manageRequiresUsers !== false ? (
                      <>
                        <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                          <span className="text-gray-700 font-medium">Per user cost:</span>
                          <span className="font-bold text-gray-900">
                            {configuration && configuration.numberOfUsers > 0
                              ? `${formatCurrency(calc.userCost / configuration.numberOfUsers)}/user`
                              : configuration?.servicePlan === 'Manage' && (configuration?.manageUsers ?? 0) > 0
                                ? `${formatCurrency(calc.userCost / (configuration.manageUsers ?? 1))}/user`
                                : 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                          <span className="text-gray-700 font-medium">User costs:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(calc.userCost)}</span>
                        </div>
                      </>
                    ) : null}
                    {/* Per GB cost — shown for no-users Manage agreements */}
                    {configuration?.servicePlan === 'Manage' && configuration?.manageRequiresUsers === false && (configuration?.manageDataGB ?? 0) > 0 && (
                      <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                        <span className="text-gray-700 font-medium">Per GB cost:</span>
                        <span className="font-bold text-gray-900">
                          {`${formatCurrency(calc.dataCost / (configuration.manageDataGB ?? 1))}/GB`}
                        </span>
                      </div>
                    )}
                    {/* Data costs */}
                    <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                      <span className="text-gray-700 font-medium">Data costs:</span>
                      <span className="font-bold text-gray-900">{formatCurrency(calc.dataCost)}</span>
                    </div>
                    {/* Migration cost */}
                    <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                      <span className="text-gray-700 font-medium">Migration cost:</span>
                      <span className="font-bold text-gray-900">{formatCurrency(calc.migrationCost)}</span>
                    </div>
                    {/* Instances Cost */}
                    <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                      <span className="text-gray-700 font-medium">Instances Cost:</span>
                      <span className="font-bold text-gray-900">{formatCurrency(calc.instanceCost)}</span>
                    </div>
                  </>
                )}
              </div>


              <button
                onClick={() => {
                  if (calc.status === 'custom') return;
                  onSelectTier(calc);
                }}
                disabled={calc.status === 'custom'}
                className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-300 ${
                  calc.status === 'custom'
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'transform hover:scale-105 shadow-lg hover:shadow-xl relative overflow-hidden group text-white ' +
                      ((configuration?.combination === 'overage-agreement' || configuration?.migrationType === 'Overage Agreement')
                        ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700')
                }`}
              >
                {calc.status !== 'custom' && (
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                )}
                <span className="relative flex items-center justify-center gap-2">
                  {calc.status === 'custom'
                    ? 'Custom — Contact Sales'
                    : (configuration?.combination === 'overage-agreement' || configuration?.migrationType === 'Overage Agreement')
                    ? 'Select Overage Agreement'
                    : configuration?.servicePlan === 'Manage'
                    ? 'Select Manage'
                    : `Select ${calc.tier.name}`}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Custom Plan Selection Section - Only for Multi combination (Original) */}
      {configuration?.migrationType === 'Multi combination' && (
        <div className="mt-8 bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-purple-900 mb-4 text-center">
            🔧 Customize Individual Combinations
          </h3>
          <p className="text-sm text-purple-700 mb-4 text-center">
            One pricing plan prices the whole quote; choose the exhibit plan separately per combination
          </p>

          <div className="space-y-4">
            {/* Global PRICING plan — same for all combinations, drives the total. */}
            <div className="bg-white rounded-lg p-4 border border-purple-200">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-700">Pricing Plan (applies to all)</span>
                <select
                  title="Pricing plan"
                  aria-label="Pricing plan"
                  value={pricingPlan}
                  onChange={(e) => setPricingPlan(e.target.value as 'Basic' | 'Standard' | 'Advanced')}
                  className="px-3 py-1.5 border border-purple-300 rounded-lg bg-white text-sm font-medium text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="Basic">Basic Plan</option>
                  <option value="Standard">Standard Plan</option>
                </select>
              </div>
              <p className="text-xs text-purple-600 mt-2">This plan prices the entire quote (all combinations).</p>
            </div>

            {/* Per-combination EXHIBIT plan — which plan's exhibits each combination includes. */}
            {allCombinations.length > 0 && (
              <div className="bg-white rounded-lg p-4 border border-purple-200">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">Combination</span>
                  <select
                    title="Combination"
                    aria-label="Combination"
                    value={activeCombination?.name || ''}
                    onChange={(e) => setSelectedCombinationView(e.target.value)}
                    className="px-3 py-1.5 border border-purple-300 rounded-lg bg-white text-sm font-medium text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500 max-w-[60%] truncate"
                  >
                    {allCombinations.map(c => (
                      <option key={`${c.type}-${c.name}`} value={c.name}>{c.label}: {c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <span className="font-medium text-gray-700">Exhibit plan for this combination</span>
                  <select
                    title="Exhibit plan for this combination"
                    aria-label="Exhibit plan for this combination"
                    value={activeCombinationPlan}
                    onChange={(e) => activeCombination && setTierForCombination(activeCombination.name, e.target.value as 'Basic' | 'Standard' | 'Advanced')}
                    className="px-3 py-1.5 border border-purple-300 rounded-lg bg-white text-sm font-medium text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="Basic">Basic Plan</option>
                    <option value="Standard">Standard Plan</option>
                  </select>
                </div>

                {/* Reflection: exhibits this combination includes (at its exhibit plan), priced at the global plan. */}
                {activeCombination && (() => {
                  const pricing = getCombinationPricing(
                    activeCombination.name,
                    activeCombination.type,
                    activeCombination.breakdown,
                    pricingTierObj
                  );
                  return (
                    <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
                      <div className="flex justify-between mb-2">
                        <span className="text-gray-600">Priced at {pricingPlan} Plan:</span>
                        <span className="font-semibold text-purple-900">{formatCurrency(pricing.totalCost)}</span>
                      </div>
                      <div className="text-gray-600 mb-1">Exhibits included ({activeCombinationPlan} Plan):</div>
                      <ul className="list-disc list-inside text-gray-700 space-y-0.5">
                        <li>{activeCombination.name} — {activeCombinationPlan} Plan (In-scope / Included)</li>
                        <li>{activeCombination.name} — {activeCombinationPlan} Plan (Out-scope / Not Included)</li>
                      </ul>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Summary — exhibit plan chosen for each combination (so the mix is visible). */}
            {allCombinations.length > 0 && (
              <div className="bg-white rounded-lg p-4 border border-purple-200">
                <span className="font-medium text-gray-700">Exhibit plan per combination</span>
                <ul className="mt-2 space-y-1 text-sm">
                  {allCombinations.map(c => (
                    <li key={`sum-${c.type}-${c.name}`} className="flex justify-between">
                      <span className="text-gray-700">{c.label}: {c.name}</span>
                      <span className="font-semibold text-purple-900">
                        {(selectedTiersPerCombination[c.name] || 'Standard')} Plan
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Custom Total Display */}
          {customTotal !== null && (
            <>
              <div className="mt-6 flex justify-between items-center text-lg bg-gradient-to-r from-purple-200 to-indigo-200 border-2 border-purple-400 rounded-lg p-4">
                <span className="font-bold text-purple-900">Custom Combined Total:</span>
                <span className="font-bold text-2xl text-purple-900">
                  {formatCurrency(customTotal * (1 - discount / 100))}
                </span>
              </div>
              
              {/* Button to proceed with custom selection */}
              <button
                onClick={() => {
                  // Create a custom PricingCalculation. ALL combinations are PRICED at the single
                  // global pricing plan; per-combination exhibit plans only affect which exhibits
                  // are pulled (handled downstream).
                  if (!configuration) return;

                  const pricingTier = PRICING_TIERS.find(t => t.name === pricingPlan) || PRICING_TIERS[1];
                  let combinedUserCost = 0;
                  let combinedDataCost = 0;
                  let combinedMigrationCost = 0;
                  let combinedInstanceCost = 0;

                  // Calculate messaging combinations
                  if (configuration.messagingConfigs && configuration.messagingConfigs.length > 0) {
                    configuration.messagingConfigs.forEach(cfg => {
                      const pricing = calculateCombinationPricing(cfg.exhibitName, 'messaging', configuration, pricingTier);
                      combinedUserCost += pricing.userCost;
                      combinedDataCost += pricing.dataCost;
                      combinedMigrationCost += pricing.migrationCost;
                      combinedInstanceCost += pricing.instanceCost;
                    });
                  }

                  // Calculate content combinations
                  if (configuration.contentConfigs && configuration.contentConfigs.length > 0) {
                    configuration.contentConfigs.forEach(cfg => {
                      const pricing = calculateCombinationPricing(cfg.exhibitName, 'content', configuration, pricingTier);
                      combinedUserCost += pricing.userCost;
                      combinedDataCost += pricing.dataCost;
                      combinedMigrationCost += pricing.migrationCost;
                      combinedInstanceCost += pricing.instanceCost;
                    });
                  }

                  // Calculate email combinations
                  if (configuration.emailConfigs && configuration.emailConfigs.length > 0) {
                    configuration.emailConfigs.forEach(cfg => {
                      const pricing = calculateCombinationPricing(cfg.exhibitName, 'email', configuration, pricingTier);
                      combinedUserCost += pricing.userCost;
                      combinedDataCost += pricing.dataCost;
                      combinedMigrationCost += pricing.migrationCost;
                      combinedInstanceCost += pricing.instanceCost;
                    });
                  }

                  // Create custom calculation: priced at the global pricing plan; per-combination
                  // exhibit plans are read downstream (sessionStorage) to pull each combination's
                  // own-plan exhibits.
                  const customCalculation: PricingCalculation = {
                    userCost: combinedUserCost,
                    dataCost: combinedDataCost,
                    migrationCost: combinedMigrationCost,
                    instanceCost: combinedInstanceCost,
                    totalCost: customTotal,
                    tier: pricingTier, // Global pricing plan (drives total + label)
                    // Include the original calculations for reference
                    messagingCalculation: calculations[0]?.messagingCalculation,
                    contentCalculation: calculations[0]?.contentCalculation,
                    emailCalculation: calculations[0]?.emailCalculation,
                    messagingCombinationBreakdowns: calculations[0]?.messagingCombinationBreakdowns,
                    contentCombinationBreakdowns: calculations[0]?.contentCombinationBreakdowns,
                    emailCombinationBreakdowns: calculations[0]?.emailCombinationBreakdowns
                  };
                  
                  console.log('🔧 Proceeding with custom plan selection:', {
                    customCalculation,
                    selectedTiers: selectedTiersPerCombination
                  });
                  
                  onSelectTier(customCalculation);
                }}
                className="mt-4 w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl relative overflow-hidden group text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative flex items-center justify-center gap-2">
                  Proceed with Custom Plan Selection
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PricingComparison;
