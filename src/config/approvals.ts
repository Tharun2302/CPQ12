// Approval workflow hardcoded configuration (no .env usage)
// Update these values to change the default recipients/steps

export const APPROVAL_TECH_EMAIL = 'anushreddydasari@gmail.com';
export const APPROVAL_LEGAL_EMAIL = 'anushreddydasari@gmail.com';
export const APPROVAL_DEALDESK_EMAIL = 'anushreddydasari@gmail.com';

export const APPROVAL_DEFAULT_STEPS = [
  { step: 1, role: 'Technical Team', email: APPROVAL_TECH_EMAIL },
  { step: 2, role: 'Legal Team', email: APPROVAL_LEGAL_EMAIL },
  { step: 3, role: 'Deal Desk', email: APPROVAL_DEALDESK_EMAIL },
];

export const APPROVAL_TOTAL_STEPS = APPROVAL_DEFAULT_STEPS.length;


