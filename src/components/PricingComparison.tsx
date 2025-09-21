import React, { useState, useEffect } from 'react';
import { PricingCalculation, ConfigurationData } from '../types/pricing';
import { formatCurrency } from '../utils/pricing';

interface PricingComparisonProps {
  calculations: PricingCalculation[];
  recommendedTier: PricingCalculation;
  onSelectTier: (calculation: PricingCalculation) => void;
  configuration?: ConfigurationData;
}

const PricingComparison: React.FC<PricingComparisonProps> = ({
  calculations,
  onSelectTier,
  configuration
}) => {
  const [discount, setDiscount] = useState<number>(0);

  // Read discount from localStorage (set in Configuration session)
  useEffect(() => {
    const loadDiscount = () => {
      try {
        const savedDiscount = localStorage.getItem('cpq_discount');
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
      if (e.key === 'cpq_discount') {
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

  // Filter plans accordingly
  const filteredCalculations = calculations.filter(calc => {
    if (enforceAdvancedOnly) {
      return calc.tier.name === 'Advanced';
    }
    return calc.tier.name === 'Basic' || calc.tier.name === 'Advanced';
  });

  // Helper function to apply discount calculations
  const calculateDiscountedPrice = (totalCost: number) => {
    const isDiscountAllowed = totalCost >= 2500;
    const isDiscountValid = discount > 0 && discount <= 10;
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

  const isSingle = filteredCalculations.length === 1;

  return (
    <div className="bg-gradient-to-br from-white via-slate-50/50 to-blue-50/30 rounded-2xl shadow-2xl border border-slate-200/50 p-8 backdrop-blur-sm">
      <div className="text-center mb-10">
        <h2 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent mb-3">
          Choose Your Perfect Plan
        </h2>
        <p className="text-gray-600 text-lg">Compare our pricing tiers and find the best fit for your project</p>
      </div>
      
      <div className={`grid grid-cols-1 ${isSingle ? 'md:grid-cols-1 justify-items-center' : 'md:grid-cols-2'} gap-8 max-w-4xl mx-auto`}>
        {filteredCalculations.map((calc) => {
          const discountInfo = calculateDiscountedPrice(calc.totalCost);
          
          return (
            <div
              key={calc.tier.id}
              className="relative rounded-2xl border-2 border-gray-200 bg-white p-8 transition-all duration-500 hover:shadow-2xl transform hover:-translate-y-2 hover:border-blue-300 w-full max-w-sm"
            >

              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold mb-3 text-gray-800">
                  {calc.tier.name}
                </h3>
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
                    <div className="text-4xl font-bold mb-2 text-gray-900">
                      {formatCurrency(calc.totalCost)}
                    </div>
                    <div className="text-sm text-gray-600 font-medium">Total project cost</div>
                    {discount > 0 && calc.totalCost < 2500 && (
                      <div className="text-xs text-amber-600 mt-1">
                        Discount available for orders above $2,500
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4 mb-8">
                {/* Per-user cost */}
                <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                  <span className="text-gray-700 font-medium">Per user cost:</span>
                  <span className="font-bold text-gray-900">
                    {configuration && configuration.numberOfUsers > 0
                      ? `${formatCurrency(calc.userCost / configuration.numberOfUsers)}/user`
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                  <span className="text-gray-700 font-medium">User costs:</span>
                  <span className="font-bold text-gray-900">{formatCurrency(calc.userCost)}</span>
                </div>
                <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                  <span className="text-gray-700 font-medium">Data costs:</span>
                  <span className="font-bold text-gray-900">{formatCurrency(calc.dataCost)}</span>
                </div>
                <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                  <span className="text-gray-700 font-medium">Migration cost:</span>
                  <span className="font-bold text-gray-900">{formatCurrency(calc.migrationCost)}</span>
                </div>
                <div className="flex justify-between items-center text-sm bg-white/60 rounded-lg p-3">
                  <span className="text-gray-700 font-medium">Instances Cost:</span>
                  <span className="font-bold text-gray-900">{formatCurrency(calc.instanceCost)}</span>
                </div>
              </div>


              <button
                onClick={() => onSelectTier(calc)}
                className="w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl relative overflow-hidden group bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative flex items-center justify-center gap-2">
                  Select {calc.tier.name}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PricingComparison;