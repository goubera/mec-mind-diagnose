const isDevelopment = import.meta.env.DEV;

/**
 * Logs errors securely - full details in development, sanitized in production
 * In production, this should be connected to an error tracking service (e.g., Sentry)
 */
export function logError(error: unknown, context?: string) {
  if (isDevelopment) {
    console.error(context ? `[${context}]` : '', error);
  }
  // In production, send to error tracking service
  // e.g., Sentry.captureException(error, { tags: { context } });
}

/**
 * Logs a sanitized error message safe for all environments
 */
export function logSanitizedError(message: string, context?: string) {
  console.error(context ? `[${context}]` : '', message);
}

/**
 * Returns a user-friendly error message without exposing technical details
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (error instanceof Error) {
    // Only expose specific known error messages
    if (error.message.includes('Invalid login credentials')) {
      return 'Email ou mot de passe incorrect';
    }
    if (error.message.includes('User already registered')) {
      return 'Un compte existe déjà avec cet email';
    }
    if (error.message.includes('Email not confirmed')) {
      return 'Veuillez confirmer votre email';
    }
  }
  
  // Generic message for all other errors
  return 'Une erreur est survenue. Veuillez réessayer.';
}
