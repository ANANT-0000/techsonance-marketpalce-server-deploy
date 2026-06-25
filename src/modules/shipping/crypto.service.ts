import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  CRYPTO_ALGORITHM,
  CRYPTO_KEY_ENV,
  CRYPTO_DEFAULT_KEY,
  CRYPTO_HASH_ALGORITHM,
  CRYPTO_ENCODING_UTF8,
  CRYPTO_ENCODING_HEX,
  CRYPTO_IV_LENGTH,
  CRYPTO_SEPARATOR,
  CRYPTO_EXPECTED_PARTS,
  CRYPTO_ERROR_INVALID_FORMAT,
} from './constants/shipping.constants';

@Injectable()
export class CryptoService {
  private readonly algorithm = CRYPTO_ALGORITHM;
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const cipherKey =
      this.configService.get<string>(CRYPTO_KEY_ENV) ||
      CRYPTO_DEFAULT_KEY;
    // Deriving a 32-byte key from the configured cipher string using SHA-256
    this.key = crypto.createHash(CRYPTO_HASH_ALGORITHM).update(cipherKey).digest();
  }

  encrypt(text: string): string {
    if (!text) return '';
    const iv = crypto.randomBytes(CRYPTO_IV_LENGTH);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    let encrypted = cipher.update(text, CRYPTO_ENCODING_UTF8, CRYPTO_ENCODING_HEX);
    encrypted += cipher.final(CRYPTO_ENCODING_HEX);
    const authTag = cipher.getAuthTag().toString(CRYPTO_ENCODING_HEX);
    return `${iv.toString(CRYPTO_ENCODING_HEX)}${CRYPTO_SEPARATOR}${encrypted}${CRYPTO_SEPARATOR}${authTag}`;
  }

  decrypt(cipherText: string): string {
    if (!cipherText) return '';
    const parts = cipherText.split(CRYPTO_SEPARATOR);
    if (parts.length !== CRYPTO_EXPECTED_PARTS) {
      throw new Error(CRYPTO_ERROR_INVALID_FORMAT);
    }
    const iv = Buffer.from(parts[0], CRYPTO_ENCODING_HEX);
    const encrypted = parts[1];
    const authTag = Buffer.from(parts[2], CRYPTO_ENCODING_HEX);
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, CRYPTO_ENCODING_HEX, CRYPTO_ENCODING_UTF8);
    decrypted += decipher.final(CRYPTO_ENCODING_UTF8);
    return decrypted;
  }
}
