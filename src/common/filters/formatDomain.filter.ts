export const formatCompanyDomain = (text: string): string => {
  if (!text) return '';

  return text.trim().toLowerCase();
};
