export const domainExtractor = (domain?: string): string => {
  if (!domain) return '';
  return domain.split('.')[0] || '';
};
