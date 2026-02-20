import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { ImportSourceType } from '../../../database/entities';

export interface AuthConfig {
  type: 'none' | 'bearer' | 'basic' | 'api_key';
  token?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  apiKeyHeader?: string;
}

export interface UrlImportConfig {
  auth?: AuthConfig;
  headers?: Record<string, string>;
}

export interface DownloadResult {
  buffer: Buffer;
  fileName: string;
  sourceType: ImportSourceType;
  contentType?: string;
}

@Injectable()
export class UrlImporterService {
  private readonly logger = new Logger(UrlImporterService.name);
  private readonly MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

  /**
   * Import file from URL
   */
  async importFromUrl(
    url: string,
    config: UrlImportConfig = {}
  ): Promise<DownloadResult> {
    this.logger.log(`Downloading file from URL: ${url}`);

    try {
      // 1. Validate URL
      this.validateUrl(url);

      // 2. Download file with authentication
      const response = await this.downloadFile(url, config);

      // 3. Detect file type
      const sourceType = this.detectSourceType(
        response.headers['content-type'],
        url
      );

      // 4. Extract file name
      const fileName = this.extractFileName(url, response.headers);

      this.logger.log(
        `Downloaded ${fileName} (${response.data.length} bytes, type: ${sourceType})`
      );

      return {
        buffer: Buffer.from(response.data),
        fileName,
        sourceType,
        contentType: response.headers['content-type'],
      };
    } catch (error) {
      this.logger.error(`Failed to download from URL: ${error.message}`);
      throw new BadRequestException(
        `Failed to download file from URL: ${error.message}`
      );
    }
  }

  /**
   * Download file from URL with authentication
   */
  private async downloadFile(
    url: string,
    config: UrlImportConfig
  ): Promise<any> {
    const headers: Record<string, string> = {
      ...config.headers,
    };

    // Add authentication headers
    if (config.auth) {
      switch (config.auth.type) {
        case 'bearer':
          if (config.auth.token) {
            headers['Authorization'] = `Bearer ${config.auth.token}`;
          }
          break;

        case 'basic':
          if (config.auth.username && config.auth.password) {
            const encoded = Buffer.from(
              `${config.auth.username}:${config.auth.password}`
            ).toString('base64');
            headers['Authorization'] = `Basic ${encoded}`;
          }
          break;

        case 'api_key':
          if (config.auth.apiKey && config.auth.apiKeyHeader) {
            headers[config.auth.apiKeyHeader] = config.auth.apiKey;
          }
          break;
      }
    }

    try {
      const response = await axios.get(url, {
        headers,
        responseType: 'arraybuffer',
        maxContentLength: this.MAX_FILE_SIZE,
        maxBodyLength: this.MAX_FILE_SIZE,
        timeout: 60000, // 60 seconds
        validateStatus: (status) => status < 400, // Accept 2xx and 3xx
      });

      return response;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          throw new Error(
            `HTTP ${error.response.status}: ${error.response.statusText}`
          );
        } else if (error.code === 'ECONNABORTED') {
          throw new Error('Request timeout - file download took too long');
        } else if (error.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED') {
          throw new Error(
            `File too large - maximum size is ${this.MAX_FILE_SIZE / 1024 / 1024}MB`
          );
        }
      }
      throw error;
    }
  }

  /**
   * Validate URL format and protocol
   */
  private validateUrl(url: string): void {
    try {
      const parsed = new URL(url);

      // Only allow HTTP and HTTPS
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(
          `Invalid protocol: ${parsed.protocol}. Only HTTP and HTTPS are supported.`
        );
      }
    } catch (error) {
      throw new BadRequestException(`Invalid URL format: ${error.message}`);
    }
  }

  /**
   * Detect source type from content-type header or file extension
   */
  private detectSourceType(
    contentType: string | undefined,
    url: string
  ): ImportSourceType {
    // Try content-type first
    if (contentType) {
      const normalized = contentType.toLowerCase();

      if (normalized.includes('csv') || normalized.includes('text/csv')) {
        return ImportSourceType.CSV;
      }

      if (
        normalized.includes('excel') ||
        normalized.includes('spreadsheet') ||
        normalized.includes(
          'vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ) ||
        normalized.includes('vnd.ms-excel')
      ) {
        return ImportSourceType.EXCEL;
      }

      if (normalized.includes('json') || normalized.includes('application/json')) {
        return ImportSourceType.JSON;
      }
    }

    // Fallback to file extension
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase();

    const typeMap: Record<string, ImportSourceType> = {
      csv: ImportSourceType.CSV,
      xlsx: ImportSourceType.EXCEL,
      xls: ImportSourceType.EXCEL,
      json: ImportSourceType.JSON,
    };

    const sourceType = ext ? typeMap[ext] : null;

    if (!sourceType) {
      throw new BadRequestException(
        `Unable to determine file type. Supported formats: CSV, Excel (.xlsx, .xls), JSON. Content-Type: ${contentType}, URL: ${url}`
      );
    }

    return sourceType;
  }

  /**
   * Extract file name from URL or Content-Disposition header
   */
  private extractFileName(url: string, headers: any): string {
    // Try Content-Disposition header first
    const contentDisposition = headers['content-disposition'];
    if (contentDisposition) {
      const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(
        contentDisposition
      );
      if (matches && matches[1]) {
        return matches[1].replace(/['"]/g, '');
      }
    }

    // Extract from URL
    const urlPath = url.split('?')[0]; // Remove query params
    const segments = urlPath.split('/');
    const fileName = segments[segments.length - 1];

    // Decode URL encoding
    return decodeURIComponent(fileName || 'imported_file');
  }
}
