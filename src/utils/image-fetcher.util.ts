import { Logger } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';

const logger = new Logger('ImageFetcher');

/**
 * Fetches a remote image URL and returns it as a Buffer.
 * Works with Cloudinary URLs, S3 URLs, or any public HTTP/HTTPS image.
 *
 * Returns null (never throws) so a missing logo never crashes invoice generation.
 */
export async function fetchImageAsBuffer(url: string): Promise<Buffer | null> {
  if (!url || typeof url !== 'string') return null;

  // Strip query strings that might confuse content-type detection
  const cleanUrl = url.trim();

  return new Promise((resolve) => {
    const protocol = cleanUrl.startsWith('https') ? https : http;

    const req = protocol.get(cleanUrl, { timeout: 8000 }, async (res) => {
      // Follow one level of redirect (Cloudinary sometimes issues 301)
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        await fetchImageAsBuffer(res.headers.location).then(resolve);
        return;
      }

      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        logger.warn(
          `Image fetch failed: HTTP ${res.statusCode} for ${cleanUrl}`,
        );
        resolve(null);
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', (err) => {
        logger.warn(`Image stream error for ${cleanUrl}: ${err.message}`);
        resolve(null);
      });
    });

    req.on('timeout', () => {
      logger.warn(`Image fetch timed out: ${cleanUrl}`);
      req.destroy();
      resolve(null);
    });

    req.on('error', (err) => {
      logger.warn(`Image fetch error for ${cleanUrl}: ${err.message}`);
      resolve(null);
    });
  });
}

/**
 * Detects image type from a URL string.
 * PDFKit needs to know if it's jpeg or png when embedding.
 */
export function detectImageType(url: string): 'jpeg' | 'png' | 'auto' {
  const lower = url.toLowerCase().split('?')[0]; // ignore query params
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpeg';
  if (lower.endsWith('.png')) return 'png';
  // Cloudinary URLs often have no extension — let PDFKit auto-detect
  return 'auto';
}
