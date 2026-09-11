'use strict';

// The rejected Origin is attacker-controlled and the CORS error is written to stderr by
// finalhandler, outside the structured logger — so it reached the log monitor's AI prompt
// verbatim, and a newline in it could forge a second log line. Kept in its own module so the
// test can require it: server.cjs has no exports and importing it would boot the server.
const PRINTABLE_ORIGIN = /^[A-Za-z0-9.:/_-]{1,120}$/;

function safeOriginLabel(origin) {
  const value = String(origin == null ? '' : origin);
  return PRINTABLE_ORIGIN.test(value) ? value : '(unprintable origin)';
}

module.exports = { safeOriginLabel };
