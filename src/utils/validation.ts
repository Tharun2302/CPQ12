import { AuthError, FormValidation } from '../types/auth';

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password validation rules
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 50;

// Validate email format
export function validateEmail(email: string): string | null {
  if (!email.trim()) {
    return 'Email is required';
  }
  
  if (!EMAIL_REGEX.test(email)) {
    return 'Please enter a valid email address';
  }
  
  return null;
}

// Validate password strength
export function validatePassword(password: string): string | null {
  if (!password) {
    return 'Password is required';
  }
  
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`;
  }
  
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be no more than ${PASSWORD_MAX_LENGTH} characters long`;
  }
  
  // Check for at least one letter and one number
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  
  if (!hasLetter || !hasNumber) {
    return 'Password must contain at least one letter and one number';
  }
  
  return null;
}

// Validate name
export function validateName(name: string): string | null {
  if (!name.trim()) {
    return 'Name is required';
  }
  
  if (name.trim().length < 2) {
    return 'Name must be at least 2 characters long';
  }
  
  if (name.trim().length > 50) {
    return 'Name must be no more than 50 characters long';
  }
  
  return null;
}

// Validate password confirmation
export function validatePasswordConfirmation(password: string, confirmPassword: string): string | null {
  if (!confirmPassword) {
    return 'Please confirm your password';
  }
  
  if (password !== confirmPassword) {
    return 'Passwords do not match';
  }
  
  return null;
}

// Validate sign-in form
export function validateSignInForm(email: string, password: string): FormValidation {
  const errors: AuthError[] = [];
  
  const emailError = validateEmail(email);
  if (emailError) {
    errors.push({ field: 'email', message: emailError });
  }
  
  const passwordError = validatePassword(password);
  if (passwordError) {
    errors.push({ field: 'password', message: passwordError });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Validate sign-up form
export function validateSignUpForm(name: string, email: string, password: string, confirmPassword: string): FormValidation {
  const errors: AuthError[] = [];
  
  const nameError = validateName(name);
  if (nameError) {
    errors.push({ field: 'name', message: nameError });
  }
  
  const emailError = validateEmail(email);
  if (emailError) {
    errors.push({ field: 'email', message: emailError });
  }
  
  const passwordError = validatePassword(password);
  if (passwordError) {
    errors.push({ field: 'password', message: passwordError });
  }
  
  const confirmPasswordError = validatePasswordConfirmation(password, confirmPassword);
  if (confirmPasswordError) {
    errors.push({ field: 'confirmPassword', message: confirmPasswordError });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Get error message for a specific field
export function getFieldError(errors: AuthError[], field: string): string | null {
  const error = errors.find(e => e.field === field);
  return error ? error.message : null;
}
