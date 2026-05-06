import * as Minio from 'minio';
import { logger } from '../utils/logger';

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'webminer',
  secretKey: process.env.MINIO_SECRET_KEY || 'webminer_minio',
});

const BUCKET = process.env.MINIO_BUCKET || 'webminer-storage';

export class StorageService {
  static async ensureBucket(): Promise<void> {
    try {
      const exists = await minioClient.bucketExists(BUCKET);
      if (!exists) {
        await minioClient.makeBucket(BUCKET, 'us-east-1');
        logger.info(`MinIO bucket '${BUCKET}' created`);
      }
    } catch (err) {
      logger.error('MinIO bucket setup error:', err);
    }
  }

  static async uploadFile(
    key: string,
    data: Buffer | string,
    contentType = 'application/octet-stream'
  ): Promise<string> {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await minioClient.putObject(BUCKET, key, buf, buf.length, {
      'Content-Type': contentType,
    });
    return key;
  }

  static async downloadFile(key: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      minioClient.getObject(BUCKET, key, (err, stream) => {
        if (err) return reject(err);
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    });
  }

  static async getPresignedUrl(key: string, expirySeconds = 3600): Promise<string> {
    return minioClient.presignedGetObject(BUCKET, key, expirySeconds);
  }

  static async deleteFile(key: string): Promise<void> {
    await minioClient.removeObject(BUCKET, key);
  }

  static async listFiles(prefix: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const keys: string[] = [];
      const stream = minioClient.listObjects(BUCKET, prefix, true);
      stream.on('data', (obj) => { if (obj.name) keys.push(obj.name); });
      stream.on('end', () => resolve(keys));
      stream.on('error', reject);
    });
  }

  // Convenience: actor source code
  static actorSourceKey(actorId: string, version: string) {
    return `actors/${actorId}/${version}/source.tar.gz`;
  }

  // Convenience: run logs
  static runLogKey(runId: string) {
    return `runs/${runId}/run.log`;
  }

  // Convenience: actor screenshots/outputs
  static runOutputKey(runId: string, filename: string) {
    return `runs/${runId}/output/${filename}`;
  }
}
