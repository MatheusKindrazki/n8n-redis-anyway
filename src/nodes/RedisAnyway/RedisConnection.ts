import IORedis from 'ioredis';
import type { RedisOptions } from 'ioredis';

export class RedisConnection {
  private static instance: IORedis | null = null;
  private static connectionOptions: RedisOptions;

  public static initialize(options: RedisOptions): void {
    // Define default connection options
    const defaultOptions: RedisOptions = {
      maxRetriesPerRequest: 3, // Reduz o limite padrão de 20 para 3
      connectTimeout: 10000,   // 10 segundos para timeout de conexão
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
        if (times > 3) {
          return null; // Não tente mais após 3 tentativas
        }
        return Math.min(times * 100, 3000); // Aumenta o tempo entre tentativas
      }
    };

    // Mescla as opções padrão com as opções fornecidas
    RedisConnection.connectionOptions = { ...defaultOptions, ...options };
  }

  public static getInstance(): IORedis {
    if (!RedisConnection.instance) {
      if (!RedisConnection.connectionOptions) {
        throw new Error('Redis connection not initialized. Call initialize() first.');
      }
      
      RedisConnection.instance = new IORedis(RedisConnection.connectionOptions);
      
      RedisConnection.instance.on('error', (error: Error) => {
        process.stderr.write(`Redis connection error: ${error.message}\n`);
      });

      RedisConnection.instance.on('connect', () => {
        process.stdout.write('Successfully connected to Redis\n');
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