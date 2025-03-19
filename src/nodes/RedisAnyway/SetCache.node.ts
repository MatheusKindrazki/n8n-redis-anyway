import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  NodeConnectionType,
} from 'n8n-workflow';
import { RedisConnection } from './RedisConnection';

export class SetCache implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Redis Set Cache',
    name: 'setCache',
    icon: 'file:redis.svg',
    group: ['transform'],
    version: 1,
    description: 'Armazena dados no Redis com tempo de expiração configurável',
    subtitle: '={{$parameter["key"]}}',
    defaults: {
      name: 'Set Cache',
    },
    inputs: [{ type: NodeConnectionType.Main }],
    outputs: [{ type: NodeConnectionType.Main }],
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
        description: 'Chave única para armazenar os dados no Redis. Recomenda-se usar prefixos para organização.',
      },
      {
        displayName: 'Value',
        name: 'value',
        type: 'string',
        default: '',
        required: true,
        description: 'Valor a ser armazenado. Pode ser texto simples ou JSON (será detectado automaticamente).',
        placeholder: '{"name": "John", "email": "john@example.com"}',
        typeOptions: {
          rows: 4,
        },
      },
      {
        displayName: 'Expiration (seconds)',
        name: 'expiration',
        type: 'number',
        default: 3600,
        required: true,
        description: 'Tempo em segundos após o qual os dados expirarão. Use 0 para não expirar.',
        hint: '3600 = 1 hora, 86400 = 1 dia, 604800 = 1 semana',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    try {
      const credentials = await this.getCredentials('redis');
      
      // Configurar conexão Redis com as credenciais
      const redisOptions = {
        host: credentials.host as string,
        port: credentials.port as number,
        username: credentials.username !== 'DEFAULT' ? credentials.username as string : undefined,
        password: credentials.password ? credentials.password as string : undefined,
        tls: credentials.useTls === true ? {} : undefined,
      };
      
      RedisConnection.initialize(redisOptions);
      const redis = RedisConnection.getInstance();

      for (let i = 0; i < items.length; i++) {
        const key = this.getNodeParameter('key', i) as string;
        const value = this.getNodeParameter('value', i) as string;
        const expiration = this.getNodeParameter('expiration', i) as number;

        try {
          // Tenta analisar o valor como JSON
          const jsonValue = JSON.parse(value);
          
          if (expiration > 0) {
            await redis.set(key, JSON.stringify(jsonValue), 'EX', expiration);
          } else {
            await redis.set(key, JSON.stringify(jsonValue));
          }
        } catch {
          // Se o valor não for JSON válido, armazena como string
          if (expiration > 0) {
            await redis.set(key, value, 'EX', expiration);
          } else {
            await redis.set(key, value);
          }
        }

        returnData.push({
          json: {
            key,
            success: true,
            expiresIn: expiration > 0 ? expiration : 'never',
            timestamp: new Date().toISOString()
          },
        });
      }

      return [returnData];
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new NodeOperationError(this.getNode(), `Erro ao armazenar no Redis: ${error.message}`);
      }
      throw new NodeOperationError(this.getNode(), 'Ocorreu um erro desconhecido');
    }
  }
} 