import Redis from 'ioredis';
import { IDataObject } from 'n8n-workflow';

export interface IRedisCredentials {
	host: string;
	port: number;
	password?: string;
	database?: number;
	ssl?: boolean;
	username?: string;
}

/**
 * Initialize a Redis client
 */
export function setupRedisClient(credentials: IRedisCredentials): Redis {
	let client;
	
	try {
		// Primeira tentativa: verificar se o host é uma URL completa
		if (credentials.host && (credentials.host.startsWith('redis://') || credentials.host.startsWith('rediss://'))) {
			console.log('Detectada URL Redis completa, conectando diretamente via URL');
			
			// Se for uma URL completa, usamos diretamente
			const connectionOptions: IDataObject = {
				// Permitir reconexão para melhorar estabilidade
				retryStrategy: (times: number) => {
					// Reconectar a cada 200ms até 3 tentativas
					if (times <= 3) {
						return 200;
					}
					return null;
				},
				lazyConnect: true,
				enableOfflineQueue: true,
				connectTimeout: 10000,
				enableReadyCheck: true,
			};
			
			// Só adicionamos password se ela existir e não estiver vazia e não estiver na URL
			if (credentials.password && credentials.password.trim() !== '' && !credentials.host.includes('@')) {
				connectionOptions.password = credentials.password;
			}
			
			client = new Redis(credentials.host, connectionOptions as any);
		} else {
			// Abordagem padrão com host/port separados
			const redisOptions: IDataObject = {
				host: credentials.host || 'localhost',
				port: credentials.port || 6379,
				db: credentials.database || 0,
				// Permitir reconexão para melhorar estabilidade
				retryStrategy: (times: number) => {
					// Reconectar a cada 200ms até 3 tentativas
					if (times <= 3) {
						return 200;
					}
					return null;
				},
				// Conectar apenas quando necessário
				lazyConnect: true,
				// Desconectar automaticamente após 60 segundos ocioso
				disconnectTimeout: 60000,
				// Tentar manter a conexão por mais tempo
				enableOfflineQueue: true,
				connectTimeout: 10000,
				// Detectar e recuperar de conexões perdidas
				enableReadyCheck: true,
			};

			// Só adicionamos password se ela existir e não estiver vazia
			if (credentials.password && credentials.password.trim() !== '') {
				redisOptions.password = credentials.password;
			}

			if (credentials.ssl === true) {
				redisOptions.tls = {};
			}

			// Só adicionamos username se ele existir e não estiver vazio
			if (credentials.username && credentials.username.trim() !== '') {
				redisOptions.username = credentials.username;
			}

			client = new Redis(redisOptions as any);
		}
		
		// Adicionar handler para erros de conexão para melhor debug
		client.on('error', (error: Error) => {
			console.error('Redis connection error:', error.message);
		});
		
		// Adicionar handler para quando a conexão é restabelecida
		client.on('reconnecting', () => {
			console.log('Redis reconnection attempt...');
		});
		
		client.on('ready', () => {
			console.log('Redis connection ready');
		});
		
		return client;
	} catch (error) {
		// Se houve erro na criação, tentamos um fallback para URL direta
		console.error('Erro ao criar cliente Redis com a configuração padrão:', error);
		
		if (!credentials.host.startsWith('redis://') && !credentials.host.startsWith('rediss://')) {
			// Se não começou com redis:// ou rediss://, tente criar uma URL
			try {
				console.log('Tentando fallback: criando URL Redis...');
				
				const protocol = credentials.ssl ? 'rediss://' : 'redis://';
				const auth = credentials.username && credentials.password 
					? `${credentials.username}:${credentials.password}@` 
					: credentials.password 
						? `:${credentials.password}@` 
						: '';
				const db = credentials.database ? `/${credentials.database}` : '';
				
				// Construindo URL no formato: redis[s]://[[user][:password@]]host[:port][/db-number]
				const redisUrl = `${protocol}${auth}${credentials.host}:${credentials.port}${db}`;
				console.log(`Tentando conexão com URL: ${redisUrl.replace(/\:[^:@]+@/, ':***@')}`);
				
				client = new Redis(redisUrl);
				
				client.on('error', (error: Error) => {
					console.error('Redis fallback connection error:', error.message);
				});
				
				return client;
			} catch (fallbackError) {
				console.error('Erro no fallback para URL Redis:', fallbackError);
				throw new Error(`Não foi possível conectar ao Redis: ${error.message}. Tentativa de fallback também falhou: ${fallbackError.message}`);
			}
		}
		
		throw new Error(`Erro ao conectar ao Redis: ${error.message}. Verifique se as configurações estão corretas.`);
	}
}

/**
 * Verifica se a conexão está ativa e pronta para uso
 */
export function isConnectionReady(client: Redis): boolean {
	return client.status === 'ready';
}

/**
 * Gerencia a conexão de forma segura, retornando o cliente conectado
 */
export async function safeConnect(client: Redis): Promise<Redis> {
	try {
		// Verifica se o cliente já está conectado
		if (isConnectionReady(client)) {
			return client;
		}
		
		// Se estiver fechado, tente reconectar forçadamente
		if (client.status === 'end' || client.status === 'close') {
			// Se a conexão está fechada, força a reconexão
			try {
				// Usando o método retry para forçar uma reconexão
				await client.connect();
				console.log('Successfully reconnected to Redis');
			} catch (reconnectError) {
				console.error('Failed to reconnect to Redis:', reconnectError);
				throw reconnectError;
			}
		}
		// Se o cliente estiver conectando, aguarde até estar pronto
		else if (client.status === 'connecting') {
			return new Promise((resolve, reject) => {
				const timeoutId = setTimeout(() => {
					client.removeAllListeners('ready');
					client.removeAllListeners('error');
					reject(new Error('Timeout waiting for Redis connection'));
				}, 5000);
				
				client.once('ready', () => {
					clearTimeout(timeoutId);
					resolve(client);
				});
				
				client.once('error', (err) => {
					clearTimeout(timeoutId);
					reject(err);
				});
			});
		}
		else {
			// Qualquer outro estado, tente conectar normalmente
			await client.connect();
		}
		
		// Verificar se a conexão está ativa com ping explícito
		await client.ping();
		
		return client;
	} catch (error) {
		console.error('Error during Redis connection management:', error);
		// Se ocorrer erro reconectando, feche o cliente e relance o erro
		try {
			await client.quit();
		} catch (e) {
			// Ignora erros ao fechar conexão
		}
		throw error;
	}
}

/**
 * Fecha a conexão de forma segura
 */
export async function safeDisconnect(client: Redis): Promise<void> {
	try {
		// Só tenta desconectar se existir um cliente e a conexão estiver ativa
		if (client && (client.status === 'ready' || client.status === 'connecting')) {
			await client.quit();
		}
	} catch (error) {
		// Ignora erros ao fechar a conexão
		console.error('Erro ao desconectar Redis:', error);
	}
}

/**
 * Set a key-value pair in Redis with expiration
 */
export async function setWithExpiry(
	client: Redis,
	key: string, 
	value: string, 
	expiryInSeconds: number
): Promise<void> {
	// Verificamos se a conexão está ativa antes de executar o comando
	if (!isConnectionReady(client)) {
		// Tentar reconectar se não estiver pronto
		await safeConnect(client);
	}
	
	try {
		await client.set(key, value, 'EX', expiryInSeconds);
	} catch (error) {
		console.error(`Error setting key ${key}:`, error);
		// Tentar reconectar e tentar novamente uma vez em caso de erro de conexão
		if (error.message.includes('connection') || error.message.includes('closed')) {
			await safeConnect(client);
			await client.set(key, value, 'EX', expiryInSeconds);
		} else {
			throw error;
		}
	}
}

/**
 * Get a value from Redis
 */
export async function getValue(client: Redis, key: string): Promise<string | null> {
	// Verificamos se a conexão está ativa antes de executar o comando
	if (!isConnectionReady(client)) {
		// Tentar reconectar se não estiver pronto
		await safeConnect(client);
	}
	
	try {
		return await client.get(key);
	} catch (error) {
		console.error(`Error getting key ${key}:`, error);
		// Tentar reconectar e tentar novamente uma vez em caso de erro de conexão
		if (error.message.includes('connection') || error.message.includes('closed')) {
			await safeConnect(client);
			return await client.get(key);
		}
		throw error;
	}
}

/**
 * Check if a key exists and is not expired
 */
export async function keyExists(client: Redis, key: string): Promise<boolean> {
	// Verificamos se a conexão está ativa antes de executar o comando
	if (!isConnectionReady(client)) {
		// Tentar reconectar se não estiver pronto
		await safeConnect(client);
	}
	
	try {
		return (await client.exists(key)) === 1;
	} catch (error) {
		console.error(`Error checking if key ${key} exists:`, error);
		// Tentar reconectar e tentar novamente uma vez em caso de erro de conexão
		if (error.message.includes('connection') || error.message.includes('closed')) {
			await safeConnect(client);
			return (await client.exists(key)) === 1;
		}
		throw error;
	}
}

/**
 * Get TTL of a key in seconds
 */
export async function getRemainingTTL(client: Redis, key: string): Promise<number> {
	// Verificamos se a conexão está ativa antes de executar o comando
	if (!isConnectionReady(client)) {
		// Tentar reconectar se não estiver pronto
		await safeConnect(client);
	}
	
	try {
		return await client.ttl(key);
	} catch (error) {
		console.error(`Error getting TTL for key ${key}:`, error);
		// Tentar reconectar e tentar novamente uma vez em caso de erro de conexão
		if (error.message.includes('connection') || error.message.includes('closed')) {
			await safeConnect(client);
			return await client.ttl(key);
		}
		throw error;
	}
} 