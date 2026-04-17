/**
 * Converts spaces and underscores to hyphens, stopping at the first '.'
 * Example: "techsonance_marketplace.com" -> "techsonance-marketplace"
 */
export const formatCompanyDomain = (text: string): string => {
  if (!text) return '';

  return text
    .split('.')[0] // 1. Get everything before the first dot
    .replace(/[\s_]+/g, '-') // 2. Replace spaces OR underscores with a hyphen
    .toLowerCase() // 3. Convert to lowercase
    .replace(/^-+|-+$/g, ''); // 4. Remove leading/trailing hyphens (clean up)
};
