'use strict';

// Kept out of server.cjs so the "which agreements may be sent for signature" rule is unit tested.

// Sending again would hand every recipient a new link and wipe the signatures already recorded.
const UNSENDABLE_STATUS_ERRORS = {
  completed: 'This document is already signed and cannot be sent again.',
  voided: 'This document has been voided and cannot be sent.',
};

/** Refusal message when this e-sign document must not be sent for signature, else null. */
function esignSendRefusal(doc) {
  const status = doc && typeof doc.status === 'string' ? doc.status.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(UNSENDABLE_STATUS_ERRORS, status)
    ? UNSENDABLE_STATUS_ERRORS[status]
    : null;
}

module.exports = { esignSendRefusal };
