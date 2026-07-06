// Universal emoji and special character sanitization utility
// This function removes emojis and special characters from text input

export function sanitizeTextInput(value: string): string {
  // Remove emojis, special characters, and keep only basic alphanumeric characters, spaces, and common punctuation
  return value.replace(/[^\w\s\-'\.@]/g, '');
}

export function sanitizeNameInput(value: string): string {
  // For name fields - allow letters, spaces, hyphens, apostrophes, periods
  return value.replace(/[^a-zA-Z\s\-'\.]/g, '');
}

export function sanitizeEmailInput(value: string): string {
  // For email fields - allow letters, numbers, @, ., -
  return value.replace(/[^\w@\.\-]/g, '');
}

export function sanitizeCompanyInput(value: string): string {
  // For company names - allow letters, numbers, spaces, common punctuation
  return value.replace(/[^\w\s\-'\.&]/g, '');
}

export function sanitizeAddressInput(value: string): string {
  // For addresses - allow letters, numbers, spaces, common address punctuation
  return value.replace(/[^\w\s\-'\.#]/g, '');
}

export function sanitizePhoneInput(value: string): string {
  // For phone numbers - allow numbers, spaces, hyphens, parentheses, plus
  return value.replace(/[^\d\s\-\(\)\+]/g, '');
}
