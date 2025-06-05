import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  NodeConnectionType,
  IDataObject,
} from 'n8n-workflow';
import { RedisConnection } from './RedisConnection';

export class GetCache implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Redis Get Cache',
    name: 'getCache',
    icon: 'file:redis.svg',
    group: ['transform'],
    version: 1,
    description: 'Recupera dados do Redis com verificação de expiração e renovação inteligente',
    subtitle: '={{$parameter["key"]}}',
    defaults: {
      name: 'Get Cache',
    },
    inputs: [{ type: NodeConnectionType.Main }],
    outputs: [
      { type: NodeConnectionType.Main, displayName: 'Valid Cache' },
      { type: NodeConnectionType.Main, displayName: 'Invalid Cache' },
      { type: NodeConnectionType.Main, displayName: 'Needs Renewal' },
    ],
    credentials: [
      {
        name: 'redis',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Key',
        name: 'key',
        type: 'string',
        default: '',
        placeholder: 'user:123:profile',
        required: true,
        description: 'Chave para recuperar os dados do Redis. Deve ser a mesma usada no Set Cache.',
      },
      {
        displayName: 'Renewal Threshold (seconds)',
        name: 'threshold',
        type: 'number',
        default: 300,
        required: true,
        description: 'Tempo em segundos antes da expiração para acionar a renovação. Recomendado: 10-20% do tempo total de expiração.',
        hint: '300 = 5 minutos antes da expiração',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const validCache: INodeExecutionData[] = [];
    const invalidCache: INodeExecutionData[] = [];
    const needsRenewal: INodeExecutionData[] = [];

    try {
      const credentials = await this.getCredentials('redis');
      
      // Configurar conexão Redis com as credenciais
      const redisOptions = {
        host: credentials.host as string,
        port: credentials.port as number,
        username: credentials.username !== 'DEFAULT' ? credentials.username as string : undefined,
        password: credentials.password ? credentials.password as string : undefined,
        tls: credentials.useTls === true ? {} : undefined,
        db: credentials.db as number,
      };
      
      RedisConnection.initialize(redisOptions);
      const redis = RedisConnection.getInstance();

      for (let i = 0; i < items.length; i++) {
        const key = this.getNodeParameter('key', i) as string;
        const threshold = this.getNodeParameter('threshold', i) as number;

        // Obter valor e tempo restante de expiração
        const [value, ttl] = await Promise.all([
          redis.get(key),
          redis.ttl(key),
        ]);

        if (value === null || ttl === -2) {
          // Chave não existe ou expirou
          invalidCache.push({
            json: {
              key,
              exists: false,
              ttl: -1,
              timestamp: new Date().toISOString(),
              status: 'invalid_cache',
            } as IDataObject,
          });
          continue;
        }

        // Tentar analisar como JSON, caso contrário usar como string
        let parsedValue: IDataObject | string;
        try {
          const parsed = JSON.parse(value);
          parsedValue = typeof parsed === 'object' ? parsed as IDataObject : value;
        } catch {
          parsedValue = value;
        }

        const result: INodeExecutionData = {
          json: {
            key,
            value: parsedValue,
            ttl: ttl === -1 ? 'never' : ttl, // -1 significa que não expira
            exists: true,
            timestamp: new Date().toISOString(),
          } as IDataObject,
        };

        if (ttl !== -1 && ttl <= threshold && ttl > 0) {
          // Cache existe mas precisa de renovação
          result.json.status = 'needs_renewal';
          validCache.push(result);
          needsRenewal.push(result);
        } else {
          // Cache é válido e não está perto de expirar
          result.json.status = 'valid_cache';
          validCache.push(result);
        }
      }

      return [validCache, invalidCache, needsRenewal];
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new NodeOperationError(this.getNode(), `Erro ao recuperar do Redis: ${error.message}`);
      }
      throw new NodeOperationError(this.getNode(), 'Ocorreu um erro desconhecido');
    }
  }
} 