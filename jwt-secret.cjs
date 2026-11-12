'use strict';

const DEFAULT_JWT_SECRET = 'your-super-secret-jwt-key-change-in-production';
const MIN_JWT_SECRET_LENGTH = 32;

function isWeakJwtSecret(value) {
  if (typeof value !== 'string') return true;
  const secret = value.trim();
  return secret.length < MIN_JWT_SECRET_LENGTH || secret === DEFAULT_JWT_SECRET;
}

module.exports = { DEFAULT_JWT_SECRET, MIN_JWT_SECRET_LENGTH, isWeakJwtSecret };
