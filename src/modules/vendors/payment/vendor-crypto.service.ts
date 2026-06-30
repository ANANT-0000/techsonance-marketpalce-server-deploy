import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class VendorCryptoService {
  private readonly algorithm = 'aes-256-gcm';

  private getMasterKey(): Buffer {
    const key = process.env.VENDOR_PAYMENT_MASTER_KEY;
    if (!key) {
      throw new Error('VENDOR_PAYMENT_MASTER_KEY environment variable is not defined.');
    }
    return crypto.createHash('sha256').update(key).digest();
  }

  encryptSecret(plaintext: string): {
    encrypted: string;
    iv: string;
    tag: string;
  } {
    const iv = crypto.randomBytes(12);
    const key = this.getMasterKey();
    const cipher = crypto.createCipheriv(
      this.algorithm,
      key,
      iv,
    ) as crypto.CipherGCM;

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag,
    };
  }

  decryptSecret(encrypted: string, iv: string, tag: string): string {
    const key = this.getMasterKey();
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      key,
      Buffer.from(iv, 'hex'),
    ) as crypto.DecipherGCM;
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
