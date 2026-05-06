export const domainExtractor = (domain: string): string => {
  return domain.split('.')[0] || '';
};
