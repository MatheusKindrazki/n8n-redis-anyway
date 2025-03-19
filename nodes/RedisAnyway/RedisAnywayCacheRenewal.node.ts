import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { setupRedisClient, getValue, keyExists, getRemainingTTL, IRedisCredentials, safeConnect, safeDisconnect, isConnectionReady, setWithExpiry } from './RedisAnywayUtils';

export class RedisAnywayCacheRenewal implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Redis Anyway 🔄 RENEW',
		name: 'redisAnywayCacheRenewal',
		icon: 'file:redis.svg',
		group: ['transform'],
		version: 1,
		description: 'Extends the expiration time of a Redis cache key and optionally updates its value',
		defaults: {
			name: 'Redis Cache Renewal',
			color: '#9c88ff',
		},
		inputs: ['main'],
		outputs: ['main', 'main'],
		outputNames: ['Renewed', 'Not Renewed'],
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
				description: 'The key in Redis cache to check and potentially renew',
				required: true,
			},
			{
				displayName: 'Renewal TTL',
				name: 'renewalTTL',
				type: 'number',
				default: 3600,
				description: 'New expiration time in seconds to set if renewal is needed',
				required: true,
			},
			{
				displayName: 'Renewal Threshold',
				name: 'renewalThreshold',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 99
				},
				default: 30,
				description: 'Percentage threshold of remaining TTL to trigger renewal (e.g., 30 means renew when 30% or less TTL remains)',
				required: true,
			},
			{
				displayName: 'Renewal Mode',
				name: 'renewalMode',
				type: 'options',
				options: [
					{
						name: 'Extend TTL Only',
						value: 'extendOnly',
						description: 'Only update the expiration time, keep the existing value',
					},
					{
						name: 'Update Value During Renewal',
						value: 'updateValue',
						description: 'Update both the expiration time and the value',
					},
				],
				default: 'extendOnly',
				description: 'Whether to only extend the TTL or also update the value during renewal',
			},
			{
				displayName: 'New Value',
				name: 'newValue',
				type: 'string',
				displayOptions: {
					show: {
						renewalMode: ['updateValue'],
					},
				},
				default: '',
				description: 'The new value to set when renewing the cache. For complex data, consider using JSON',
				typeOptions: {
					rows: 4,
				},
			},
			{
				displayName: 'JSON Output',
				name: 'jsonOutput',
				type: 'boolean',
				displayOptions: {
					show: {
						renewalMode: ['updateValue'],
					},
				},
				default: false,
				description: 'Whether to stringify complex objects before storing in Redis',
			},
			{
				displayName: 'Always Update Value',
				name: 'alwaysUpdateValue',
				type: 'boolean',
				displayOptions: {
					show: {
						renewalMode: ['updateValue'],
					},
				},
				default: false,
				description: 'Whether to update the value even if renewal is not needed (force update)',
			},
			{
				displayName: 'Include Key Value',
				name: 'includeValue',
				type: 'boolean',
				default: true,
				description: 'Whether to include the current value of the key in the output',
			},
			{
				displayName: 'Output Property Name',
				name: 'propertyName',
				type: 'string',
				default: 'cachedData',
				description: 'The property name to store the retrieved cache data under (if Include Key Value is enabled)',
			},
			{
				displayName: 'JSON Parse',
				name: 'jsonParse',
				type: 'boolean',
				default: false,
				description: 'Whether to parse the Redis cached value as JSON when retrieving',
			},
			{
				displayName: 'Include Cache Metadata',
				name: 'includeMetadata',
				type: 'boolean',
				default: true,
				description: 'Whether to include cache metadata like TTL and renewal status in the output',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		
		// Create empty arrays for both outputs
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
			
			// Inicializa o cliente Redis
			client = setupRedisClient(redisCredentials);

			// Conecta com segurança
			await safeConnect(client);

			// Process each item
			for (let i = 0; i < items.length; i++) {
				const key = this.getNodeParameter('key', i) as string;
				const renewalTTL = this.getNodeParameter('renewalTTL', i) as number;
				const renewalThreshold = this.getNodeParameter('renewalThreshold', i) as number;
				const renewalMode = this.getNodeParameter('renewalMode', i) as string;
				const includeValue = this.getNodeParameter('includeValue', i) as boolean;
				const propertyName = includeValue ? this.getNodeParameter('propertyName', i) as string : '';
				const jsonParse = this.getNodeParameter('jsonParse', i) as boolean;
				const includeMetadata = this.getNodeParameter('includeMetadata', i) as boolean;
				
				// Update value options
				let newValue = '';
				let jsonOutput = false;
				let alwaysUpdateValue = false;
				
				if (renewalMode === 'updateValue') {
					newValue = this.getNodeParameter('newValue', i) as string;
					jsonOutput = this.getNodeParameter('jsonOutput', i) as boolean;
					alwaysUpdateValue = this.getNodeParameter('alwaysUpdateValue', i) as boolean;
				}

				if (!key) {
					throw new NodeOperationError(this.getNode(), 'No key specified');
				}

				// Check if key exists
				const exists = await keyExists(client, key);
				
				if (exists) {
					// Get current TTL and value
					const currentTTL = await getRemainingTTL(client, key);
					let currentValue = null;
					
					if (includeValue) {
						currentValue = await getValue(client, key);
						
						// Parse JSON if needed
						if (jsonParse && currentValue) {
							try {
								currentValue = JSON.parse(currentValue);
							} catch (error) {
								throw new NodeOperationError(this.getNode(), `Failed to parse Redis value as JSON: ${error.message}`);
							}
						}
					}
					
					// If TTL is -1, it means the key never expires
					if (currentTTL === -1) {
						const newItem = { ...items[i].json };
						
						if (includeValue) {
							newItem[propertyName] = currentValue;
						}
						
						if (includeMetadata) {
							newItem['redis_key'] = key;
							newItem['redis_ttl'] = -1;
							newItem['redis_needs_renewal'] = false;
							newItem['redis_renewed'] = false;
							newItem['redis_permanent'] = true;
						}
						
						// Handle forced value update for permanent keys
						if (renewalMode === 'updateValue' && alwaysUpdateValue) {
							// Prepare value for storing
							let valueToStore = newValue;
							if (jsonOutput && typeof newValue === 'object') {
								valueToStore = JSON.stringify(newValue);
							}
							
							// Set the new value but keep it permanent
							await client.set(key, valueToStore);
							
							if (includeMetadata) {
								newItem['redis_value_updated'] = true;
							}
							
							renewedOutput.push({ json: newItem });
						} else {
							// Key never expires, so it doesn't need renewal
							notRenewedOutput.push({ json: newItem });
						}
					} 
					// If TTL is > 0, check if renewal is needed
					else if (currentTTL > 0) {
						// Calculate maximum TTL (assuming this is what the key was set with originally)
						// This is an approximation - in real usage you might want to store the original TTL somewhere
						const originalTTL = renewalTTL; // Assumption: renewal TTL is same as original
						
						// Calculate the threshold for renewal
						const thresholdSeconds = (originalTTL * renewalThreshold) / 100;
						
						// Decide if renewal is needed
						const needsRenewal = currentTTL <= thresholdSeconds;
						
						const newItem = { ...items[i].json };
						
						if (includeValue) {
							newItem[propertyName] = currentValue;
						}
						
						if (includeMetadata) {
							newItem['redis_key'] = key;
							newItem['redis_ttl_before'] = currentTTL;
							newItem['redis_renewal_threshold'] = thresholdSeconds;
							newItem['redis_needs_renewal'] = needsRenewal;
							newItem['redis_permanent'] = false;
						}
						
						// Handle renewal and/or value update
						const shouldUpdateValue = renewalMode === 'updateValue' && (needsRenewal || alwaysUpdateValue);
						
						if (needsRenewal || shouldUpdateValue) {
							if (shouldUpdateValue) {
								// Update both TTL and value
								let valueToStore = newValue;
								if (jsonOutput && typeof newValue === 'object') {
									valueToStore = JSON.stringify(newValue);
								}
								
								// Set new value with expiry
								await setWithExpiry(client, key, valueToStore, renewalTTL);
								
								if (includeMetadata) {
									newItem['redis_value_updated'] = true;
								}
							} else {
								// Just renew the TTL
								await client.expire(key, renewalTTL);
							}
							
							if (includeMetadata) {
								// Get new TTL after renewal
								const newTTL = await getRemainingTTL(client, key);
								newItem['redis_ttl_after'] = newTTL;
								newItem['redis_renewed'] = true;
								newItem['redis_renewal_ttl'] = renewalTTL;
							}
							
							renewedOutput.push({ json: newItem });
						} else {
							if (includeMetadata) {
								newItem['redis_renewed'] = false;
								newItem['redis_value_updated'] = false;
							}
							
							notRenewedOutput.push({ json: newItem });
						}
					} else {
						// If TTL is 0 or negative (except -1), the key is about to expire or has expired
						// We don't handle expired keys here - they should go to the "not renewed" path
						const newItem = { ...items[i].json };
						
						if (includeMetadata) {
							newItem['redis_key'] = key;
							newItem['redis_ttl'] = currentTTL;
							newItem['redis_needs_renewal'] = false;
							newItem['redis_renewed'] = false;
							newItem['redis_expired'] = true;
						}
						
						notRenewedOutput.push({ json: newItem });
					}
				} else {
					// Key doesn't exist
					const newItem = { ...items[i].json };
					
					if (includeMetadata) {
						newItem['redis_key'] = key;
						newItem['redis_exists'] = false;
						newItem['redis_renewed'] = false;
					}
					
					notRenewedOutput.push({ json: newItem });
				}
			}

			// Return both outputs
			return [renewedOutput, notRenewedOutput];
			
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