import type { ErrorCode } from '../error-constants.js';

export const fr: Record<ErrorCode, string> = {
  // Generic
  INTERNAL_SERVER_ERROR: 'Erreur interne du serveur',
  BAD_REQUEST: 'Requête invalide',
  NOT_FOUND: 'Ressource introuvable',

  // Authentication
  UNAUTHORIZED: 'Authentification requise',
  FORBIDDEN: 'Accès refusé',
  INVALID_CREDENTIALS: 'Email ou mot de passe incorrect',
  INVALID_TOKEN: 'Jeton invalide',
  TOKEN_EXPIRED: 'Le jeton a expiré',
  INVALID_REFRESH_TOKEN: 'Jeton de rafraîchissement invalide ou expiré',

  // Users
  USER_NOT_FOUND: 'Utilisateur introuvable',
  USER_ALREADY_EXISTS: 'Un compte avec cet email existe déjà',

  // Permissions
  INSUFFICIENT_PERMISSIONS:
    "Vous n'avez pas la permission d'effectuer cette action",

  // Example resource
  RESOURCE_NOT_FOUND: 'Ressource introuvable',
  RESOURCE_ALREADY_EXISTS: 'Cette ressource existe déjà',
};
