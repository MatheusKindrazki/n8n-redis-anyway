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

// Armazenamento global da instância do cliente
let globalRedisClient: Redis | null = null;
let lastCredentialsHash: string = '';

/**
 * Cria um hash simples das credenciais para comparação
 */
function hashCredentials(credentials: IRedisCredentials): string {
	return `${credentials.host}:${credentials.port}:${credentials.database || 0}:${credentials.username || ''}:${credentials.password ? 'haspass' : 'nopass'}:${credentials.ssl ? 'ssl' : 'nossl'}`;
}

/**
 * Initialize a Redis client ou retorna o existente se compatível
 */
export function setupRedisClient(credentials: IRedisCredentials): Redis {
	const credentialsHash = hashCredentials(credentials);
	
	// Se já temos um cliente e as credenciais são as mesmas, reutilize-o
	if (globalRedisClient && lastCredentialsHash === credentialsHash) {
		console.log('Reusing existing Redis client');
		if (globalRedisClient.status === 'ready') {
			console.log('Existing Redis client is ready');
			return globalRedisClient;
		} else {
			console.log(`Existing Redis client status is ${globalRedisClient.status}, attempting reconnection`);
		}
	}
	
	// Se estamos criando um novo cliente, tente fechar o anterior se existir
	if (globalRedisClient) {
		try {
			// Desconecta assincronamente - não esperamos por isso
			console.log('Closing previous Redis client');
			globalRedisClient.disconnect();
		} catch (e) {
			console.error('Error closing previous Redis client:', e);
		}
	}
	
	const redisOptions: IDataObject = {
		host: credentials.host || 'localhost',
		port: credentials.port || 6379,
		db: credentials.database || 0,
		// Estratégia de reconexão persistente
		retryStrategy: (times: number) => {
			// Reconexão exponencial com limite máximo de 30 segundos
			const delay = Math.min(Math.pow(2, times) * 100, 30000);
			console.log(`Redis retry strategy - attempt ${times}, delay: ${delay}ms`);
			return delay;
		},
		// Configurações mais robustas para conexão persistente
		connectTimeout: 20000, // 20 segundos para timeout de conexão
		maxRetriesPerRequest: 10, // Mais tentativas por request
		enableOfflineQueue: true, // Permite enfileirar comandos offline
		reconnectOnError: (err: Error) => {
			console.log(`Redis reconnectOnError triggered: ${err.message}`);
			return true; // Sempre tenta reconectar em caso de erro
		},
		// Manter conexão ativa
		enableReadyCheck: true,
		// Nunca desconectar automaticamente
		disconnectTimeout: 0, // Desativa desconexão automática
		// Agressiva detecção de problemas de rede
		keepAlive: 5000, // TCP keepalive a cada 5 segundos
		noDelay: true, // Desativa o algoritmo de Nagle para latência reduzida
		autoResubscribe: true, // Resubscreve automaticamente a canais
		autoResendUnfulfilledCommands: true, // Reenvia comandos não atendidos
		readOnly: false, // Não usar modo somente leitura
		enableAutoPipelining: true, // Melhor performance
	};

	// Só adicionamos password se ela existir e não estiver vazia
	if (credentials.password && credentials.password.trim() !== '') {
		redisOptions.password = credentials.password;
	}

	if (credentials.ssl === true) {
		redisOptions.tls = {
			// Opções seguras recomendadas
			rejectUnauthorized: true,
		};
	}

	// Só adicionamos username se ele existir e não estiver vazio
	if (credentials.username && credentials.username.trim() !== '') {
		redisOptions.username = credentials.username;
	}

	// Tenta criar um cliente com novas opções
	try {
		console.log(`Creating new Redis client to ${credentials.host}:${credentials.port}`);
		const client = new Redis(redisOptions as any);
		
		// Handler para erros com informações detalhadas
		client.on('error', (error: Error) => {
			console.error(`Redis connection error: ${error.message}`);
		});
		
		// Monitoramento de eventos de reconexão
		client.on('reconnecting', (params: { delay: number, attempt: number }) => {
			console.log(`Redis reconnection attempt ${params.attempt}, delay: ${params.delay}ms`);
		});
		
		// Detectar quando uma conexão é perdida
		client.on('end', () => {
			console.warn('Redis connection ended');
		});
		
		// Registrar conexão estabelecida
		client.on('connect', () => {
			console.log('Redis raw connection established');
		});
		
		// Detectar quando pronto para uso
		client.on('ready', () => {
			console.log('Redis connection ready for use');
		});
		
		// Armazena o cliente globalmente para reutilização
		globalRedisClient = client;
		lastCredentialsHash = credentialsHash;
		
		return client;
	} catch (error) {
		// Log detalhado para problemas de configuração
		console.error('Error creating Redis client:', error);
		throw error;
	}
}

/**
 * Verifica se a conexão está ativa e pronta para uso
 */
export function isConnectionReady(client: Redis): boolean {
	return client && client.status === 'ready';
}

/**
 * Gerencia a conexão de forma segura, com múltiplas tentativas
 */
export async function safeConnect(client: Redis): Promise<Redis> {
	// Máximo de tentativas de conexão
	const maxAttempts = 5;
	let attempt = 0;
	let lastError: Error | null = null;
	
	while (attempt < maxAttempts) {
		attempt++;
		try {
			console.log(`[Attempt ${attempt}/${maxAttempts}] Connecting to Redis...`);
			
			// Se o cliente já estiver pronto, apenas retorne-o
			if (client.status === 'ready') {
				console.log('Redis client already ready');
				
				// Verificar se a conexão está realmente funcional com um ping
				try {
					const pingResult = await client.ping();
					if (pingResult === 'PONG') {
						console.log('Redis connection verified with PING');
						return client;
					} else {
						throw new Error(`Unexpected PING response: ${pingResult}`);
					}
				} catch (pingError) {
					console.error(`Redis connection check failed: ${pingError.message}`);
					// Continuar para tentativa de reconexão
				}
			}
			
			// Se não estiver pronto, tente conectar
			if (client.status === 'end' || client.status === 'close') {
				console.log(`Redis connection state: ${client.status}. Attempting to connect...`);
				await client.connect();
			}
			
			// Espera estar pronto com timeout
			if (client.status !== 'ready') {
				console.log(`Waiting for Redis connection to be ready (currently: ${client.status})...`);
				await new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(() => {
						client.removeAllListeners('ready');
						client.removeAllListeners('error');
						reject(new Error(`Timeout waiting for connection (status: ${client.status})`));
					}, 5000);
					
					client.once('ready', () => {
						clearTimeout(timeout);
						resolve();
					});
					
					client.once('error', (err) => {
						clearTimeout(timeout);
						reject(err);
					});
				});
			}
			
			// Verificar conexão com ping
			const pingResult = await client.ping();
			console.log(`Redis PING result: ${pingResult}`);
			if (pingResult === 'PONG') {
				return client;
			} else {
				throw new Error(`Unexpected PING response: ${pingResult}`);
			}
		} catch (error) {
			lastError = error;
			console.error(`Connection attempt ${attempt} failed: ${error.message}`);
			
			// Se não for a última tentativa, aguarde e tente novamente
			if (attempt < maxAttempts) {
				const delay = Math.min(Math.pow(2, attempt) * 500, 8000);
				console.log(`Retrying in ${delay}ms...`);
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}
	}
	
	// Se chegamos aqui, todas as tentativas falharam
	throw new Error(`Failed to connect to Redis after ${maxAttempts} attempts: ${lastError?.message}`);
}

/**
 * Fecha a conexão de forma segura apenas quando necessário
 * Nota: Apenas usado na finalização, não em operações normais
 */
export async function safeDisconnect(client: Redis): Promise<void> {
	try {
		// Quase sempre queremos manter a conexão ativa, então apenas registramos
		console.log(`Redis disconnect requested (status: ${client.status})`);
		
		// Só tenta desconectar se solicitado explicitamente para desligamento
		// Na maioria dos casos, queremos manter a conexão viva para reutilização
		if (client && (client.status === 'ready' || client.status === 'connecting')) {
			// Usar disconnect() em vez de quit() para fechamento mais rápido
			await client.disconnect();
			console.log('Redis client disconnected successfully');
		}
	} catch (error) {
		console.error('Error disconnecting Redis:', error);
	}
}

/**
 * Função wrapper para executar comandos Redis com retry automático
 */
async function executeWithRetry<T>(
	client: Redis, 
	operation: string,
	command: () => Promise<T>,
	maxRetries = 3
): Promise<T> {
	let retries = 0;
	let lastError: Error | null = null;
	
	while (retries <= maxRetries) {
		try {
			// Verifica e garante que a conexão esteja pronta
			if (!isConnectionReady(client)) {
				console.log(`Redis not ready before ${operation}. Reconnecting...`);
				client = await safeConnect(client);
			}
			
			// Executa o comando
			return await command();
		} catch (error) {
			lastError = error;
			retries++;
			console.error(`Redis ${operation} failed (attempt ${retries}/${maxRetries+1}): ${error.message}`);
			
			// Verifica se é um erro de conexão
			const isConnectionError = error.message.includes('connection') || 
									 error.message.includes('closed') ||
									 error.message.includes('end') ||
									 error.message.includes('timeout') ||
									 client.status !== 'ready';
			
			if (isConnectionError && retries <= maxRetries) {
				console.log(`Connection issue detected. Attempting to reconnect...`);
				try {
					// Atraso exponencial entre tentativas
					const delay = Math.min(Math.pow(2, retries) * 200, 5000);
					console.log(`Waiting ${delay}ms before retry...`);
					await new Promise(resolve => setTimeout(resolve, delay));
					
					// Tenta reconexão
					client = await safeConnect(client);
				} catch (reconnectError) {
					console.error(`Reconnection failed: ${reconnectError.message}`);
				}
			} else if (retries > maxRetries) {
				break;
			}
		}
	}
	
	// Se chegamos aqui, todas as tentativas falharam
	throw lastError || new Error(`Unknown error during ${operation}`);
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
	await executeWithRetry(
		client,
		`setWithExpiry(${key})`,
		async () => client.set(key, value, 'EX', expiryInSeconds)
	);
}

/**
 * Get a value from Redis
 */
export async function getValue(client: Redis, key: string): Promise<string | null> {
	return executeWithRetry(
		client,
		`getValue(${key})`,
		async () => client.get(key)
	);
}

/**
 * Check if a key exists and is not expired
 */
export async function keyExists(client: Redis, key: string): Promise<boolean> {
	const result = await executeWithRetry(
		client,
		`keyExists(${key})`,
		async () => client.exists(key)
	);
	
	return result === 1;
}

/**
 * Get TTL of a key in seconds
 */
export async function getRemainingTTL(client: Redis, key: string): Promise<number> {
	return executeWithRetry(
		client,
		`getRemainingTTL(${key})`,
		async () => client.ttl(key)
	);
} 