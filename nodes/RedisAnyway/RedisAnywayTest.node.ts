import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { setupRedisClient, safeConnect, safeDisconnect, IRedisCredentials } from './RedisAnywayUtils';

export class RedisAnywayTest implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Redis Anyway 🔄 TEST',
		name: 'redisAnywayTest',
		icon: 'file:redis.svg',
		group: ['transform'],
		version: 1,
		description: 'Test your Redis connection to ensure credentials are working properly',
		defaults: {
			name: 'Redis Connection Test',
			color: '#ba3c3c',
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
				displayName: 'Test Connection',
				name: 'testConnection',
				type: 'notice',
				default: '',
				description: 'Este nó irá testar a conexão com o Redis usando as credenciais fornecidas',
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
			
			// Inicializa o cliente Redis
			client = setupRedisClient(redisCredentials);

			// Tentativa de conexão
			await safeConnect(client);

			// Testa com PING
			const pingResult = await client.ping();

			// Para cada item de entrada, adiciona informação de sucesso
			for (let i = 0; i < items.length; i++) {
				const newItem = {
					...items[i].json,
					connection_test: {
						success: true,
						message: 'Conexão com Redis estabelecida com sucesso!',
						response: pingResult,
						host: redisCredentials.host,
						port: redisCredentials.port,
						database: redisCredentials.database,
						timestamp: new Date().toISOString(),
					},
				};

				returnItems.push({ json: newItem });
			}

			return [returnItems];
		} catch (error) {
			throw new NodeOperationError(
				this.getNode(),
				`Falha na conexão Redis: ${error.message}. Verifique suas credenciais.`
			);
		} finally {
			// Garante que a conexão seja fechada mesmo em caso de erro
			if (client) {
				await safeDisconnect(client);
			}
		}
	}
} 