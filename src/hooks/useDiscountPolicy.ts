import { useContext } from 'react';

import {
  DEFAULT_DISCOUNT_POLICY_VALUE,
  DiscountPolicyContext,
  DiscountPolicyContextValue,
} from '../contexts/DiscountPolicyContext';

// Outside the provider (isolated component tests, public pages) the safe default cap applies
export function useDiscountPolicy(): DiscountPolicyContextValue {
  return useContext(DiscountPolicyContext) ?? DEFAULT_DISCOUNT_POLICY_VALUE;
}

export default useDiscountPolicy;
