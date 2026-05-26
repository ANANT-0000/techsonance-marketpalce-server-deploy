/**
 * Extracts the public ID from a Cloudinary URL.
 * @param {string} url - The full Cloudinary URL
 * @returns {string|null} - The public ID or null if invalid
 */
export function extractCloudinaryPublicId(url: string | null): string | null {
  if (!url) return null;

  // 1. Split by '/upload/' to get the path part
  const parts = url.split('/upload/');

  if (parts.length < 2) return null;

  let path = parts[1];

  // 2. Remove the version if it exists (e.g., 'v1779442020/')
  // This looks for 'v' followed by digits and a slash at the start
  path = path.replace(/^v\d+\//, '');

  // 3. Remove the file extension (the last part after the dot)
  return path.replace(/\.[^/.]+$/, '');
}
