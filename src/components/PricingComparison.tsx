import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle } from 'lucide-react';
import { PricingCalculation, ConfigurationData, PricingTier } from '../types/pricing';
import { formatCurrency, PRICING_TIERS, calculateCombinationPricing } from '../utils/pricing';

interface PricingComparisonProps {
  calculations: PricingCalculation[];
  recommendedTier: PricingCalculation;
  onSelectTier: (calculation: PricingCalculation) => void;
  configuration?: ConfigurationData;
  selectedTier?: PricingCalculation | null; // Add selectedTier prop to know which plan is selected
}

const PricingComparison: React.FC<PricingComparisonProps> = ({
  calculations,
  onSelectTier,
  configuration,
  selectedTier
}) => {
  const [discount, setDiscount] = useState<number>(0);
  
  // Track selected tier per combination (key: combinationName, value: tier name)
  // Load from sessionStorage on mount to persist across navigation
  const [selectedTiersPerCombination, setSelectedTiersPerCombination] = useState<Record<string, 'Basic' | 'Standard' | 'Advanced'>>(() => {
    try {
      const saved = sessionStorage.getItem('cpq_selected_tiers_per_combination');
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('📋 Restored per-combination tier selections:', parsed);
        return parsed;
      }
    } catch (e) {
      console.warn('Could not load per-combination tiers:', e);
    }
    return {};
  });

  // Save per-combination tier selections to sessionStorage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem('cpq_selected_tiers_per_combination', JSON.stringify(selectedTiersPerCombination));
      console.log('💾 Saved per-combination tier selections:', selectedTiersPerCombination);
    } catch (e) {
      console.warn('Could not save per-combination tiers:', e);
    }
  }, [selectedTiersPerCombination]);

  // Initialize selected tiers with the current calculation tier (Standard by default)
  useEffect(() => {
    if (configuration?.migrationType === 'Multi combination' && calculations.length > 0) {
      const defaultTier = calculations.find(c => c.tier.name === 'Standard')?.tier.name || 'Standard';
      const initialTiers: Record<string, 'Basic' | 'Standard' | 'Advanced'> = {};
      
      // Initialize all combinations with Standard tier
      calculations[0]?.messagingCombinationBreakdowns?.forEach(b => {
        initialTiers[b.combinationName] = defaultTier;
      });
      calculations[0]?.contentCombinationBreakdowns?.forEach(b => {
        initialTiers[b.combinationName] = defaultTier;
      });
      calculations[0]?.emailCombinationBreakdowns?.forEach(b => {
        initialTiers[b.combinationName] = defaultTier;
      });
      
      setSelectedTiersPerCombination(prev => {
        // Only set if not already set (preserve user selections from sessionStorage)
        const updated = { ...prev };
        Object.keys(initialTiers).forEach(key => {
          if (!updated[key]) {
            updated[key] = initialTiers[key];
          }
        });
        return updated;
      });
    }
  }, [calculations, configuration]);

  // Calculate custom total based on selected tiers per combination
  const customTotal = useMemo(() => {
    if (!configuration || configuration.migrationType !== 'Multi combination') {
      return null;
    }

    let total = 0;
    const breakdown: Array<{ combinationName: string; tier: string; cost: number; type: string }> = [];
    
    // Calculate messaging combinations
    if (configuration.messagingConfigs && configuration.messagingConfigs.length > 0) {
      configuration.messagingConfigs.forEach(cfg => {
        const selectedTierName = selectedTiersPerCombination[cfg.exhibitName] || 'Standard';
        const tier = PRICING_TIERS.find(t => t.name === selectedTierName) || PRICING_TIERS[1];
        const pricing = calculateCombinationPricing(cfg.exhibitName, 'messaging', configuration, tier);
        total += pricing.totalCost;
        breakdown.push({
          combinationName: cfg.exhibitName,
          tier: selectedTierName,
          cost: pricing.totalCost,
          type: 'messaging'
        });
      });
    }
    
    // Calculate content combinations
    if (configuration.contentConfigs && configuration.contentConfigs.length > 0) {
      configuration.contentConfigs.forEach(cfg => {
        const selectedTierName = selectedTiersPerCombination[cfg.exhibitName] || 'Standard';
        const tier = PRICING_TIERS.find(t => t.name === selectedTierName) || PRICING_TIERS[1];
        const pricing = calculateCombinationPricing(cfg.exhibitName, 'content', configuration, tier);
        total += pricing.totalCost;
        breakdown.push({
          combinationName: cfg.exhibitName,
          tier: selectedTierName,
          cost: pricing.totalCost,
          type: 'content'
        });
      });
    }
    
    // Calculate email combinations
    if (configuration.emailConfigs && configuration.emailConfigs.length > 0) {
      configuration.emailConfigs.forEach(cfg => {
        const selectedTierName = selectedTiersPerCombination[cfg.exhibitName] || 'Standard';
        const tier = PRICING_TIERS.find(t => t.name === selectedTierName) || PRICING_TIERS[1];
        const pricing = calculateCombinationPricing(cfg.exhibitName, 'email', configuration, tier);
        total += pricing.totalCost;
        breakdown.push({
          combinationName: cfg.exhibitName,
          tier: selectedTierName,
          cost: pricing.totalCost,
          type: 'email'
        });
      });
    }
    
    // Debug logging
    console.log('🔧 Custom Total Calculation:', {
      breakdown,
      total,
      selectedTiers: selectedTiersPerCombination
    });
    
    return total;
  }, [configuration, selectedTiersPerCombination]);

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

  // Business rule: if users > 25,000 show ONLY the Advanced plan
  const enforceAdvancedOnly = (configuration?.numberOfUsers || 0) > 25000;

  // Filter plans based on migration type
  const filteredCalculations = calculations.filter(calc => {
    // For overage agreement, show only ONE plan (first available)
    if (configuration?.combination === 'overage-agreement') {
      return calc === calculations[0];
    }
    
    if (enforceAdvancedOnly) {
      return calc.tier.name === 'Advanced';
    }
    
    // Filter plans based on combination value (works for Content, Multi combination, and Messaging)
    const combination = configuration?.combination;
    
    // Define which combinations should hide Basic plan
    const hideBasicPlan = combination === 'dropbox-to-sharepoint' || 
                          combination === 'dropbox-to-onedrive' ||
                          combination === 'dropbox-to-google' ||
                          combination === 'dropbox-to-microsoft' ||
                          combination === 'dropbox-to-box' ||
                          combination === 'dropbox-to-egnyte' ||
                          combination === 'box-to-box' ||
                          combination === 'box-to-dropbox' ||
                          combination === 'box-to-google-mydrive' ||
                          combination === 'box-to-google-sharedrive' ||
                          combination === 'box-to-sharepoint' ||
                          combination === 'box-to-onedrive' ||
                          combination === 'box-to-microsoft' ||
                          combination === 'box-to-google' ||
                          combination === 'google-sharedrive-to-egnyte' ||
                          combination === 'google-sharedrive-to-google-sharedrive' ||
                          combination === 'google-sharedrive-to-onedrive' ||
                          combination === 'google-sharedrive-to-sharepoint' ||
                          combination === 'google-mydrive-to-dropbox' ||
                          combination === 'google-mydrive-to-egnyte' ||
                          combination === 'google-mydrive-to-onedrive' ||
                          combination === 'google-mydrive-to-sharepoint' ||
                          combination === 'google-mydrive-to-google-sharedrive' ||
                          combination === 'google-mydrive-to-google-mydrive' ||
                          combination === 'onedrive-to-onedrive' ||
                          combination === 'onedrive-to-google-mydrive' ||
                          combination === 'sharepoint-online-to-egnyte' ||
                          combination === 'sharefile-to-google-mydrive' ||
                          combination === 'sharefile-to-google-sharedrive' ||
                          combination === 'sharefile-to-onedrive' ||
                          combination === 'sharefile-to-sharepoint' ||
                          combination === 'sharefile-to-sharefile' ||
                          combination === 'egnyte-to-google-sharedrive' ||
                          combination === 'egnyte-to-sharepoint-online' ||
                          combination === 'egnyte-to-google-mydrive' ||
                          combination === 'egnyte-to-onedrive' ||
                          combination === 'nfs-to-google' ||
                          combination === 'egnyte-to-google' ||
                          combination === 'egnyte-to-microsoft' ||
                          combination === 'nfs-to-microsoft';
    
    // Hide Standard plan for specific combinations (only Basic and Advanced available)
    const hideStandardPlan = combination === 'box-to-aws-s3';
    
    // Check if this is a messaging combination
    const isMessagingCombination = combination === 'slack-to-teams' || 
                                   combination === 'slack-to-google-chat' ||
                                   combination === 'google-chat-to-teams';
    
    // Hide Basic plan for specific combinations
    if (hideBasicPlan && calc.tier.name === 'Basic') {
      return false;
    }
    
    // Hide Standard plan for specific combinations
    if (hideStandardPlan && calc.tier.name === 'Standard') {
      return false;
    }
    
    // For Messaging combinations: show only 2 plans (Basic, Advanced)
    if (isMessagingCombination) {
      return calc.tier.name === 'Basic' || calc.tier.name === 'Advanced';
    }
    
    // For Content combinations and others: show all 3 plans (Basic, Standard, Advanced)
    return calc.tier.name === 'Basic' || calc.tier.name === 'Standard' || calc.tier.name === 'Advanced';
  });

  // Helper function to apply discount calculations
  const calculateDiscountedPrice = (totalCost: number) => {
    const isDiscountAllowed = totalCost >= 2500;
    const isDiscountValid = discount > 0 && discount <= 15;
    const shouldApplyDiscount = isDiscountAllowed && isDiscountValid;
    
    if (shouldApplyDiscount) {
      const discountAmount = totalCost * (discount / 100);
      const finalTotal = totalCost - discountAmount;
      return {
        originalPrice: totalCost,
        discountAmount,
        finalPrice: finalTotal >= 2500 ? finalTotal : totalCost, // Don't apply if final would be < $2500
        hasDiscount: finalTotal >= 2500,
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
          {configuration?.combination === 'overage-agreement' ? 'Overage Agreement Pricing' : 'Choose Your Perfect Plan'}
        </h2>
        <p className="text-gray-600 text-lg">
          {configuration?.combination === 'overage-agreement' 
            ? 'Instance costs only - no user or data costs apply'
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
            
            // Apply $2500 minimum to overall Multi combination total
            const MINIMUM_TOTAL = 2500;
            if (planTotal < MINIMUM_TOTAL) {
              planTotal = MINIMUM_TOTAL;
            }
          }
          
          const discountInfo = calculateDiscountedPrice(planTotal);
          const isBelowMinimumMultiCombination =
            configuration?.migrationType === 'Multi combination' &&
            originalTotalBeforeMinimum > 0 &&
            originalTotalBeforeMinimum < 2500;
          
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
                {configuration?.combination === 'overage-agreement' ? (
                  <h3 className={`text-2xl font-bold mb-3 ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>
                    Overage Agreement
                  </h3>
                ) : (
                  <h3 className={`text-2xl font-bold mb-3 ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>
                    {calc.tier.name}
                  </h3>
                )}
                {discountInfo.hasDiscount ? (
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
                    {/* When below minimum: show $2,500 (amount charged) as main price; calculated amount as secondary */}
                    {isBelowMinimumMultiCombination ? (
                      <>
                        <div className="text-4xl font-bold mb-2 text-gray-900">
                          {formatCurrency(2500)}
                        </div>
                        <div className="text-sm text-gray-600 font-medium">Total project cost</div>
                        <div className="text-sm text-red-600 font-medium mt-1">
                          Calculated: {formatCurrency(originalTotalBeforeMinimum)} (below minimum)
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-4xl font-bold mb-2 text-gray-900">
                          {formatCurrency(planTotal)}
                        </div>
                        <div className="text-sm text-gray-600 font-medium">Total project cost</div>
                      </>
                    )}
                    {discount > 0 && planTotal < 2500 && (
                      <div className="text-xs text-amber-600 mt-1">
                        Discount available for orders above $2,500
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4 mb-8">
                {/* For MULTI COMBINATION: Show separate Messaging + Content breakdowns */}
                {configuration?.migrationType === 'Multi combination' && (calc.messagingCalculation || calc.contentCalculation) ? (
                  <>
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-lg p-4 mb-4">
                      <p className="text-sm text-purple-800 font-bold text-center">
                        🔀 Multi Combination Pricing Breakdown
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

                    {/* Combined Total - show tier-based total for this plan column */}
                    <div className="flex justify-between items-center text-base bg-gradient-to-r from-purple-100 to-indigo-100 border-2 border-purple-300 rounded-lg p-4">
                      <span className="font-bold text-purple-900">Combined Total ({calc.tier.name} Plan):</span>
                      <span className="font-bold text-2xl text-purple-900">{formatCurrency(planTotal)}</span>
                    </div>
                  </>
                ) : configuration?.combination === 'overage-agreement' ? (
                  <>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                      <p className="text-sm text-purple-800 font-medium text-center">
                        💡 Overage Agreement includes only instance/server costs
                      </p>
                    </div>
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
                    {/* Per-user cost */}
                    <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                      <span className="text-gray-700 font-medium">Per user cost:</span>
                      <span className="font-bold text-gray-900">
                        {configuration && configuration.numberOfUsers > 0
                          ? `${formatCurrency(calc.userCost / configuration.numberOfUsers)}/user`
                          : 'N/A'}
                      </span>
                    </div>
                    {/* User costs */}
                    <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                      <span className="text-gray-700 font-medium">User costs:</span>
                      <span className="font-bold text-gray-900">{formatCurrency(calc.userCost)}</span>
                    </div>
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
                onClick={() => onSelectTier(calc)}
                className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl relative overflow-hidden group ${
                  configuration?.combination === 'overage-agreement'
                    ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                } text-white`}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative flex items-center justify-center gap-2">
                  {configuration?.combination === 'overage-agreement' ? 'Select Overage Agreement' : `Select ${calc.tier.name}`}
                </span>
              </button>
              
              {/* Informational note when calculated total was below minimum (selection allowed; charge is $2,500) */}
              {isBelowMinimumMultiCombination && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800 font-medium text-center">
                    Minimum project total is $2,500. You can select this plan to proceed.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom Plan Selection Section - Only for Multi combination */}
      {configuration?.migrationType === 'Multi combination' && (
        <div className="mt-8 bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-purple-900 mb-4 text-center">
            🔧 Customize Individual Combinations
          </h3>
          <p className="text-sm text-purple-700 mb-4 text-center">
            Select different plans for each combination to see a custom total
          </p>
          
          <div className="space-y-4">
            {/* Messaging Combinations */}
            {calculations[0]?.messagingCombinationBreakdowns?.map((breakdown) => {
              const selectedTier = selectedTiersPerCombination[breakdown.combinationName] || 'Standard';
              return (
                <div key={breakdown.combinationName} className="bg-white rounded-lg p-4 border border-purple-200">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">
                      Messaging: {breakdown.combinationName}
                    </span>
                    <select
                      value={selectedTier}
                      onChange={(e) => {
                        setSelectedTiersPerCombination(prev => ({
                          ...prev,
                          [breakdown.combinationName]: e.target.value as 'Basic' | 'Standard' | 'Advanced'
                        }));
                      }}
                      className="px-3 py-1.5 border border-purple-300 rounded-lg bg-white text-sm font-medium text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="Basic">Basic Plan</option>
                      <option value="Standard">Standard Plan</option>
                      <option value="Advanced">Advanced Plan</option>
                    </select>
                  </div>
                </div>
              );
            })}

            {/* Content Combinations */}
            {calculations[0]?.contentCombinationBreakdowns?.map((breakdown) => {
              const selectedTier = selectedTiersPerCombination[breakdown.combinationName] || 'Standard';
              return (
                <div key={breakdown.combinationName} className="bg-white rounded-lg p-4 border border-purple-200">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">
                      Content: {breakdown.combinationName}
                    </span>
                    <select
                      value={selectedTier}
                      onChange={(e) => {
                        setSelectedTiersPerCombination(prev => ({
                          ...prev,
                          [breakdown.combinationName]: e.target.value as 'Basic' | 'Standard' | 'Advanced'
                        }));
                      }}
                      className="px-3 py-1.5 border border-purple-300 rounded-lg bg-white text-sm font-medium text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="Basic">Basic Plan</option>
                      <option value="Standard">Standard Plan</option>
                      <option value="Advanced">Advanced Plan</option>
                    </select>
                  </div>
                </div>
              );
            })}

            {/* Email Combinations */}
            {calculations[0]?.emailCombinationBreakdowns?.map((breakdown) => {
              const selectedTier = selectedTiersPerCombination[breakdown.combinationName] || 'Standard';
              return (
                <div key={breakdown.combinationName} className="bg-white rounded-lg p-4 border border-purple-200">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">
                      Email: {breakdown.combinationName}
                    </span>
                    <select
                      value={selectedTier}
                      onChange={(e) => {
                        setSelectedTiersPerCombination(prev => ({
                          ...prev,
                          [breakdown.combinationName]: e.target.value as 'Basic' | 'Standard' | 'Advanced'
                        }));
                      }}
                      className="px-3 py-1.5 border border-purple-300 rounded-lg bg-white text-sm font-medium text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="Basic">Basic Plan</option>
                      <option value="Standard">Standard Plan</option>
                      <option value="Advanced">Advanced Plan</option>
                    </select>
                  </div>
                </div>
              );
            })}
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
                  if (customTotal > 0 && customTotal < 2500) {
                    alert('Below $2,500 not applicable. Please select additional combinations or adjust your configuration to meet the minimum requirement of $2,500.');
                    return;
                  }
                  // Create a custom PricingCalculation from the selected tiers
                  if (!configuration) return;
                  
                  let combinedUserCost = 0;
                  let combinedDataCost = 0;
                  let combinedMigrationCost = 0;
                  let combinedInstanceCost = 0;
                  
                  // Calculate messaging combinations
                  if (configuration.messagingConfigs && configuration.messagingConfigs.length > 0) {
                    configuration.messagingConfigs.forEach(cfg => {
                      const selectedTierName = selectedTiersPerCombination[cfg.exhibitName] || 'Standard';
                      const tier = PRICING_TIERS.find(t => t.name === selectedTierName) || PRICING_TIERS[1];
                      const pricing = calculateCombinationPricing(cfg.exhibitName, 'messaging', configuration, tier);
                      combinedUserCost += pricing.userCost;
                      combinedDataCost += pricing.dataCost;
                      combinedMigrationCost += pricing.migrationCost;
                      combinedInstanceCost += pricing.instanceCost;
                    });
                  }
                  
                  // Calculate content combinations
                  if (configuration.contentConfigs && configuration.contentConfigs.length > 0) {
                    configuration.contentConfigs.forEach(cfg => {
                      const selectedTierName = selectedTiersPerCombination[cfg.exhibitName] || 'Standard';
                      const tier = PRICING_TIERS.find(t => t.name === selectedTierName) || PRICING_TIERS[1];
                      const pricing = calculateCombinationPricing(cfg.exhibitName, 'content', configuration, tier);
                      combinedUserCost += pricing.userCost;
                      combinedDataCost += pricing.dataCost;
                      combinedMigrationCost += pricing.migrationCost;
                      combinedInstanceCost += pricing.instanceCost;
                    });
                  }
                  
                  // Calculate email combinations
                  if (configuration.emailConfigs && configuration.emailConfigs.length > 0) {
                    configuration.emailConfigs.forEach(cfg => {
                      const selectedTierName = selectedTiersPerCombination[cfg.exhibitName] || 'Standard';
                      const tier = PRICING_TIERS.find(t => t.name === selectedTierName) || PRICING_TIERS[1];
                      const pricing = calculateCombinationPricing(cfg.exhibitName, 'email', configuration, tier);
                      combinedUserCost += pricing.userCost;
                      combinedDataCost += pricing.dataCost;
                      combinedMigrationCost += pricing.migrationCost;
                      combinedInstanceCost += pricing.instanceCost;
                    });
                  }
                  
                  // Create custom calculation (use Standard tier as base, but with custom totals)
                  const customCalculation: PricingCalculation = {
                    userCost: combinedUserCost,
                    dataCost: combinedDataCost,
                    migrationCost: combinedMigrationCost,
                    instanceCost: combinedInstanceCost,
                    totalCost: customTotal,
                    tier: PRICING_TIERS[1], // Use Standard as base tier
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
                disabled={customTotal > 0 && customTotal < 2500}
                className={`mt-4 w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl relative overflow-hidden group text-white ${
                  customTotal > 0 && customTotal < 2500
                    ? 'bg-gray-400 cursor-not-allowed hover:scale-100 hover:shadow-lg'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'
                }`}
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
