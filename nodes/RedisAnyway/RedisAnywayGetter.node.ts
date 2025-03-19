import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { setupRedisClient, getValue, keyExists, getRemainingTTL, IRedisCredentials, safeConnect, safeDisconnect } from './RedisAnywayUtils';

export class RedisAnywayGetter implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Redis Anyway ⬅️ CACHE',
		name: 'redisAnywayGetter',
		icon: 'file:redis.svg',
		group: ['transform'],
		version: 1,
		description: 'Retrieve data from Redis cache and direct flow based on cache status (READER)',
		defaults: {
			name: 'Redis Cache Reader',
			color: '#4ecdc4',
		},
		inputs: ['main'],
		outputs: ['main', 'main'],
		outputNames: ['Cache Valid', 'Cache Invalid'],
		credentials: [
			{
				name: 'redisAnyway',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Cache Key',
				name: 'key',
				type: 'string',
				default: '',
				placeholder: 'cache:user:123',
				description: 'The unique key to retrieve cached data from Redis',
				required: true,
			},
			{
				displayName: 'Output Property Name',
				name: 'propertyName',
				type: 'string',
				default: 'cachedData',
				description: 'The property name where the retrieved cache data will be stored in the output',
			},
			{
				displayName: 'JSON Parse',
				name: 'jsonParse',
				type: 'boolean',
				default: false,
				description: 'Whether to parse the Redis cached value as JSON (turn on if you cached JSON data)',
			},
			{
				displayName: 'Include Cache Metadata',
				name: 'includeMetadata',
				type: 'boolean',
				default: true,
				description: 'Whether to include cache metadata like TTL and cache hit status in the output',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		
		// Create empty arrays for both outputs
		const cacheValidOutput: INodeExecutionData[] = [];
		const cacheInvalidOutput: INodeExecutionData[] = [];
		let client;

		try {
			const credentials = await this.getCredentials('redisAnyway');
			
			// Converter as credenciais para o formato esperado
			const redisCredentials: IRedisCredentials = {
				host: credentials.host as string,
				port: credentials.port as number,
				password: credentials.password as string,
				database: credentials.database as number,
				ssl: credentials.ssl as boolean,
				username: credentials.username as string,
			};
			
			// Inicializa o cliente Redis com as novas funções de gerenciamento de conexão
			client = setupRedisClient(redisCredentials);

			// Conecta com segurança - não precisamos de ping explícito, pois já é feito dentro de safeConnect
			await safeConnect(client);

			// Process each item
			for (let i = 0; i < items.length; i++) {
				const key = this.getNodeParameter('key', i) as string;
				const propertyName = this.getNodeParameter('propertyName', i) as string;
				const jsonParse = this.getNodeParameter('jsonParse', i) as boolean;
				const includeMetadata = this.getNodeParameter('includeMetadata', i) as boolean;

				if (!key) {
					throw new NodeOperationError(this.getNode(), 'No key specified');
				}

				// Check if key exists
				const exists = await keyExists(client, key);
				
				if (exists) {
					// Cache valid - get the value
					let value = await getValue(client, key);
					
					// Parse JSON if needed
					if (jsonParse && value) {
						try {
							value = JSON.parse(value);
						} catch (error) {
							// If parsing fails, continue with the raw value
							throw new NodeOperationError(this.getNode(), `Failed to parse Redis value as JSON: ${error.message}`);
						}
					}

					const newItem = { ...items[i].json };
					newItem[propertyName] = value;
					
					// Add metadata if requested
					if (includeMetadata) {
						newItem['redis_ttl'] = await getRemainingTTL(client, key);
						newItem['redis_key'] = key;
						newItem['redis_cache_hit'] = true;
					}

					cacheValidOutput.push({ json: newItem });
				} else {
					// Cache invalid / miss
					const newItem = { ...items[i].json };
					
					if (includeMetadata) {
						newItem['redis_key'] = key;
						newItem['redis_cache_hit'] = false;
					}

					cacheInvalidOutput.push({ json: newItem });
				}
			}

			// Return both outputs (valid cache data, invalid cache data)
			return [cacheValidOutput, cacheInvalidOutput];
			
		} catch (error) {
			throw new NodeOperationError(this.getNode(), error);
		} finally {
			// Garante que a conexão seja fechada mesmo em caso de erro
			if (client) {
				await safeDisconnect(client);
			}
		}
	}
} 