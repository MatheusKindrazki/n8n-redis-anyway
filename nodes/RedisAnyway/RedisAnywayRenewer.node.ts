import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { setupRedisClient, getValue, keyExists, getRemainingTTL, setWithExpiry, IRedisCredentials, safeConnect, safeDisconnect } from './RedisAnywayUtils';

export class RedisAnywayRenewer implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Redis Anyway 🔄 RENEW',
		name: 'redisAnywayRenewer',
		icon: 'file:redis.svg',
		group: ['transform'],
		version: 1,
		description: 'Verifica e renova o cache do Redis antes da expiração (renovação otimista)',
		defaults: {
			name: 'Redis Cache Renewer',
			color: '#8854d0',
		},
		inputs: ['main'],
		outputs: ['main', 'main'],
		outputNames: ['Renovado', 'Não Renovado'],
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
				description: 'A chave do cache no Redis a ser verificada e possivelmente renovada',
				required: true,
			},
			{
				displayName: 'Output Property Name',
				name: 'propertyName',
				type: 'string',
				default: 'cachedData',
				description: 'O nome da propriedade onde os dados do cache serão armazenados na saída',
			},
			{
				displayName: 'Limiar de TTL (segundos)',
				name: 'ttlThreshold',
				type: 'number',
				default: 300,
				description: 'Se o TTL restante for menor que este valor (em segundos), o cache será renovado',
				required: true,
			},
			{
				displayName: 'Nova Expiração (segundos)',
				name: 'newExpiryTime',
				type: 'number',
				default: 3600,
				description: 'Tempo em segundos para a nova expiração após a renovação',
				required: true,
			},
			{
				displayName: 'Incluir Metadados do Cache',
				name: 'includeMetadata',
				type: 'boolean',
				default: true,
				description: 'Se deve incluir metadados como TTL e status na saída',
			},
			{
				displayName: 'Usar JSON',
				name: 'useJson',
				type: 'boolean',
				default: true,
				description: 'Se deve tratar o valor como JSON',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		
		// Criar arrays vazios para ambas as saídas
		const renewedOutput: INodeExecutionData[] = [];
		const notRenewedOutput: INodeExecutionData[] = [];
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
			
			// Inicializar o cliente Redis
			client = setupRedisClient(redisCredentials);

			// Conectar com segurança
			await safeConnect(client);

			// Processar cada item
			for (let i = 0; i < items.length; i++) {
				const key = this.getNodeParameter('key', i) as string;
				const propertyName = this.getNodeParameter('propertyName', i) as string;
				const ttlThreshold = this.getNodeParameter('ttlThreshold', i) as number;
				const newExpiryTime = this.getNodeParameter('newExpiryTime', i) as number;
				const includeMetadata = this.getNodeParameter('includeMetadata', i) as boolean;
				const useJson = this.getNodeParameter('useJson', i) as boolean;

				if (!key) {
					throw new NodeOperationError(this.getNode(), 'Nenhuma chave especificada');
				}

				// Verificar se a chave existe
				const exists = await keyExists(client, key);
				
				if (exists) {
					// Obter o valor atual
					let value = await getValue(client, key);
					
					// Obter o TTL restante
					const remainingTTL = await getRemainingTTL(client, key);
					
					// Decidir se renova o cache
					const shouldRenew = remainingTTL >= 0 && remainingTTL <= ttlThreshold;
					
					// Processar valor JSON se necessário
					let parsedValue = value;
					if (useJson && value) {
						try {
							parsedValue = JSON.parse(value);
						} catch (error) {
							throw new NodeOperationError(this.getNode(), `Falha ao analisar valor do Redis como JSON: ${error.message}`);
						}
					}
					
					const newItem = { ...items[i].json };
					newItem[propertyName] = parsedValue;
					
					if (includeMetadata) {
						newItem['redis_key'] = key;
						newItem['redis_ttl_original'] = remainingTTL;
						newItem['redis_cache_renewed'] = shouldRenew;
					}
					
					if (shouldRenew) {
						// Renovar o cache com o mesmo valor mas nova expiração
						await setWithExpiry(client, key, value as string, newExpiryTime);
						
						if (includeMetadata) {
							newItem['redis_ttl_new'] = newExpiryTime;
							newItem['redis_renewal_timestamp'] = new Date().toISOString();
						}
						
						renewedOutput.push({ json: newItem });
					} else {
						// Cache ainda tem TTL suficiente
						notRenewedOutput.push({ json: newItem });
					}
				} else {
					// Cache não existe
					const newItem = { ...items[i].json };
					
					if (includeMetadata) {
						newItem['redis_key'] = key;
						newItem['redis_cache_exists'] = false;
						newItem['redis_cache_renewed'] = false;
					}
					
					notRenewedOutput.push({ json: newItem });
				}
			}

			// Retornar ambas as saídas (cache renovado, cache não renovado)
			return [renewedOutput, notRenewedOutput];
			
		} catch (error) {
			throw new NodeOperationError(this.getNode(), error);
		} finally {
			// Garantir que a conexão seja fechada mesmo em caso de erro
			if (client) {
				await safeDisconnect(client);
			}
		}
	}
} 