'use strict';

// Kept out of server.cjs so the "who may see signing tokens" rule is testable without a database.

const { actorIsEsignDocumentCreator } = require('./esign-creator-utils.cjs');

// Name-based on purpose: a token field added to esign_recipients later is hidden by default.
const TOKEN_FIELD_PATTERN = /token/i;

/** Copy of a recipient row with every field whose name contains "token" removed. */
function stripTokenFields(recipient) {
  const out = {};
  Object.keys(recipient || {}).forEach((key) => {
    if (!TOKEN_FIELD_PATTERN.test(key)) out[key] = recipient[key];
  });
  return out;
}

/**
 * True only for the document creator or an approval admin. `user` must come from the verified
 * login (getOptionalAuthenticatedUser), never from a header, query or body value.
 */
function callerMaySeeRecipientTokens({ doc, user, isApprovalAdmin }) {
  if (!user || !user.email) return false;
  return isApprovalAdmin === true || actorIsEsignDocumentCreator(doc, user.email);
}

/** Same list and shape for everyone; only creators and approval admins keep the token fields. */
function recipientsForCaller({ recipients, doc, user, isApprovalAdmin }) {
  const list = Array.isArray(recipients) ? recipients : [];
  if (callerMaySeeRecipientTokens({ doc, user, isApprovalAdmin })) return list;
  return list.map(stripTokenFields);
}

module.exports = {
  stripTokenFields,
  callerMaySeeRecipientTokens,
  recipientsForCaller,
};
