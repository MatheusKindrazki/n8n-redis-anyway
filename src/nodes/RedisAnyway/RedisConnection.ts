import IORedis from 'ioredis';
import type { RedisOptions } from 'ioredis';

export class RedisConnection {
  private static instance: IORedis | null = null;
  private static connectionOptions: RedisOptions;

  public static initialize(options: RedisOptions): void {
    RedisConnection.connectionOptions = options;
  }

  public static getInstance(): IORedis {
    if (!RedisConnection.instance) {
      RedisConnection.instance = new IORedis(RedisConnection.connectionOptions);
      
      RedisConnection.instance.on('error', (error: Error) => {
        process.stderr.write(`Redis connection error: ${error.message}\n`);
      });
    }
    return RedisConnection.instance;
  }

  public static async disconnect(): Promise<void> {
    if (RedisConnection.instance) {
      await RedisConnection.instance.quit();
      RedisConnection.instance = null;
    }
  }
} 