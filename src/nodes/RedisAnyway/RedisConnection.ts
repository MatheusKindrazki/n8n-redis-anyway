import IORedis from 'ioredis';
import type { RedisOptions } from 'ioredis';

export class RedisConnection {
  private static instance: IORedis | null = null;
  private static connectionOptions: RedisOptions;

  public static initialize(options: RedisOptions): void {
    // Define default connection options
    const defaultOptions: RedisOptions = {
      maxRetriesPerRequest: 1,     // Reduz para 1 para evitar tentativas múltiplas em uma única requisição
      connectTimeout: 15000,       // Aumenta para 15 segundos para dar mais tempo de conexão
      enableReadyCheck: true,
      commandTimeout: 10000,       // Timeout para comandos individuais
      enableOfflineQueue: false,   // Desativa fila offline para falhar mais rapidamente
      reconnectOnError: (err) => {
        // Reconectar em caso de erros relacionados à rede, mas não em erros de autenticação
        const targetError = err.toString();
        return targetError.includes('ECONNRESET') || 
               targetError.includes('ETIMEDOUT') || 
               targetError.includes('ECONNREFUSED');
      },
      retryStrategy: (times: number) => {
        console.log(`Redis connection retry attempt: ${times}`);
        if (times > 3) {
          console.log('Max retry attempts reached, giving up');
          return null; // Desiste após 3 tentativas
        }
        const delay = Math.min(times * 500, 5000); // Aumenta o tempo entre tentativas
        console.log(`Will retry in ${delay}ms`);
        return delay;
      }
    };

    // Mescla as opções padrão com as opções fornecidas
    RedisConnection.connectionOptions = { ...defaultOptions, ...options };
    
    console.log('Redis connection options:', {
      host: RedisConnection.connectionOptions.host,
      port: RedisConnection.connectionOptions.port,
      username: RedisConnection.connectionOptions.username ? '(set)' : '(not set)',
      password: RedisConnection.connectionOptions.password ? '(set)' : '(not set)',
      tls: RedisConnection.connectionOptions.tls ? '(enabled)' : '(disabled)',
      db: RedisConnection.connectionOptions.db,
    });
  }

  public static getInstance(): IORedis {
    if (!RedisConnection.instance) {
      if (!RedisConnection.connectionOptions) {
        throw new Error('Redis connection not initialized. Call initialize() first.');
      }
      
      console.log('Creating new Redis connection...');
      
      // Reset da instância para garantir que começamos do zero
      RedisConnection.instance = null;
      
      RedisConnection.instance = new IORedis(RedisConnection.connectionOptions);

      // Eventos de conexão
      RedisConnection.instance.on('connect', () => {
        console.log('Redis: Connected to server, authentification pending');
      });
      
      RedisConnection.instance.on('ready', () => {
        console.log('Redis: Connection established and ready to use');
      });
      
      RedisConnection.instance.on('error', (error: Error) => {
        console.error(`Redis connection error: ${error.message}`);
        if (error.message.includes('ECONNRESET')) {
          console.error('ECONNRESET error detected - connection abruptly closed');
        }
      });
      
      RedisConnection.instance.on('close', () => {
        console.log('Redis: Connection closed');
      });
      
      RedisConnection.instance.on('reconnecting', () => {
        console.log('Redis: Attempting to reconnect...');
      });
      
      // Tenta um ping para verificar a conexão
      RedisConnection.instance.ping().then(() => {
        console.log('Redis connection successful (PING)');
      }).catch(err => {
        console.error('Redis ping failed:', err.message);
      });
    }
    
    return RedisConnection.instance;
  }

  public static async disconnect(): Promise<void> {
    if (RedisConnection.instance) {
      try {
        console.log('Disconnecting from Redis...');
        await RedisConnection.instance.quit();
        console.log('Redis disconnected successfully');
      } catch (error) {
        console.error('Error disconnecting from Redis:', error);
      } finally {
        RedisConnection.instance = null;
      }
    }
  }
} 