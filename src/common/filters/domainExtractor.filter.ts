import { isUUID } from 'class-validator';

export const domainExtractor = (domain?: string): string => {
  if (!domain) return '';
  if (isUUID(domain)) return domain;
  return domain.split('.')[0] || '';
};
