import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly algorithm = 'aes-256-gcm';
  private key: Buffer;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');

    if (!encryptionKey) {
      throw new Error(
        'ENCRYPTION_KEY is not set in environment variables. ' +
        'Generate one with: openssl rand -hex 32'
      );
    }

    try {
      this.key = Buffer.from(encryptionKey, 'hex');
    } catch (error) {
      throw new Error('Invalid ENCRYPTION_KEY format. Expected 64 hex characters.');
    }

    if (this.key.length !== 32) {
      throw new Error(
        `Invalid ENCRYPTION_KEY length. Expected 32 bytes (64 hex characters), got ${this.key.length} bytes.`
      );
    }
  }

  /**
   * Encrypts a string using AES-256-GCM
   * Returns format: iv:authTag:encryptedData (all in hex)
   */
  encrypt(text: string): string {
    try {
      // Generate random initialization vector (16 bytes for AES)
      const iv = randomBytes(16);

      // Create cipher
      const cipher = createCipheriv(this.algorithm, this.key, iv);

      // Encrypt the text
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag (16 bytes for GCM)
      const authTag = cipher.getAuthTag();

      // Return iv:authTag:encrypted (all in hex)
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypts a string encrypted with the encrypt method
   * Expects format: iv:authTag:encryptedData (all in hex)
   */
  decrypt(encryptedData: string): string {
    try {
      // Split the encrypted data
      const parts = encryptedData.split(':');

      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const [ivHex, authTagHex, encrypted] = parts;

      // Convert hex strings to buffers
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      // Validate lengths
      if (iv.length !== 16) {
        throw new Error('Invalid IV length');
      }
      if (authTag.length !== 16) {
        throw new Error('Invalid auth tag length');
      }

      // Create decipher
      const decipher = createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt the text
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypts an object by converting it to JSON first
   */
  encryptObject<T>(obj: T): string {
    const jsonString = JSON.stringify(obj);
    return this.encrypt(jsonString);
  }

  /**
   * Decrypts and parses an encrypted object
   */
  decryptObject<T>(encryptedData: string): T {
    const jsonString = this.decrypt(encryptedData);
    return JSON.parse(jsonString) as T;
  }
}
