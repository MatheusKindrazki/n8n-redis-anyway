import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { setupRedisClient, setWithExpiry, IRedisCredentials, safeConnect, safeDisconnect } from './RedisAnywayUtils';

export class RedisAnywaySetter implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Redis Anyway ➡️ CACHE',
		name: 'redisAnywaySetter',
		icon: 'file:redis.svg',
		group: ['transform'],
		version: 1,
		description: 'Store data in Redis cache with expiration time (WRITER)',
		defaults: {
			name: 'Redis Cache Writer',
			color: '#ff6b6b',
		},
		inputs: ['main'],
		outputs: ['main'],
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
				description: 'The unique key to store this cache data under in Redis',
				required: true,
			},
			{
				displayName: 'Cache Value',
				name: 'value',
				type: 'string',
				default: '',
				description: 'The data to cache in Redis. For complex data, use JSON.stringify() or enable JSON Output below',
				typeOptions: {
					rows: 4,
				},
				required: true,
			},
			{
				displayName: 'Expiration Time',
				name: 'expiryTime',
				type: 'number',
				default: 3600,
				description: 'Time in seconds until the cached data expires. Default is 1 hour (3600 seconds)',
				required: true,
			},
			{
				displayName: 'JSON Output',
				name: 'jsonOutput',
				type: 'boolean',
				default: false,
				description: 'Whether to automatically stringify complex objects before storing in Redis',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnItems: INodeExecutionData[] = [];
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
				let value = this.getNodeParameter('value', i) as string;
				const expiryTime = this.getNodeParameter('expiryTime', i) as number;
				const jsonOutput = this.getNodeParameter('jsonOutput', i) as boolean;

				if (!key) {
					throw new NodeOperationError(this.getNode(), 'No key specified');
				}

				if (jsonOutput && typeof value === 'object') {
					value = JSON.stringify(value);
				}

				// Store value with expiry
				await setWithExpiry(client, key, value, expiryTime);

				// Return the item with operation result metadata
				const newItem = {
					...items[i].json,
					redis_operation: 'set',
					redis_key: key,
					redis_expiry: expiryTime,
					redis_success: true,
				};

				returnItems.push({ json: newItem });
			}

			return [returnItems];
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