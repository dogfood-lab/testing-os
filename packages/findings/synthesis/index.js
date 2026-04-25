/**
 * Synthesis layer exports.
 */
export { derivePatterns } from './pattern-derivation.js';
export { deriveRecommendations, loadAcceptedPatterns } from './recommendation-derivation.js';
export { deriveDoctrine } from './doctrine-derivation.js';
export { validatePattern, validateRecommendation, validateDoctrine } from './validate-artifacts.js';
export { writePattern, writeRecommendation, writeDoctrine, loadPatterns, loadRecommendations, loadDoctrines } from './write-artifacts.js';
