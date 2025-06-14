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
        displayName: 'Data Type',
        name: 'dataType',
        type: 'options',
        options: [
          {
            name: 'String',
            value: 'string',
            description: 'Armazena o valor como uma string simples',
          },
          {
            name: 'JSON',
            value: 'json',
            description: 'Armazena o valor como um objeto JSON',
          },
          {
            name: 'Hash',
            value: 'hash',
            description: 'Armazena o valor como um hash do Redis (conjunto de campos chave-valor)',
          },
        ],
        default: 'string',
        required: true,
        description: 'Tipo de dado a ser armazenado no Redis',
      },
      {
        displayName: 'Value',
        name: 'value',
        type: 'string',
        default: '',
        required: true,
        description: 'Valor a ser armazenado. Para JSON e Hash, use formato JSON válido.',
        placeholder: '{"name": "John", "email": "john@example.com"}',
        displayOptions: {
          show: {
            dataType: ['string', 'json'],
          },
        },
        typeOptions: {
          rows: 4,
        },
      },
      {
        displayName: 'Hash Fields',
        name: 'hashFields',
        type: 'fixedCollection',
        typeOptions: {
          multipleValues: true,
        },
        displayOptions: {
          show: {
            dataType: ['hash'],
          },
        },
        default: {},
        options: [
          {
            name: 'fields',
            displayName: 'Fields',
            values: [
              {
                displayName: 'Field',
                name: 'field',
                type: 'string',
                default: '',
                description: 'Nome do campo no hash',
              },
              {
                displayName: 'Value',
                name: 'value',
                type: 'string',
                default: '',
                description: 'Valor do campo',
              },
            ],
          },
        ],
        description: 'Campos e valores para armazenar no hash',
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
      
      const redisOptions = {
        host: credentials.host as string,
        port: credentials.port as number,
        db: credentials.database ?? 0,
        username: credentials.username !== 'DEFAULT' ? credentials.username as string : undefined,
        password: credentials.password ? credentials.password as string : undefined,
        tls: credentials.useTls === true ? {} : undefined,
      };
      
      RedisConnection.initialize(redisOptions);
      const redis = await RedisConnection.getInstance();

      for (let i = 0; i < items.length; i++) {
        const key = this.getNodeParameter('key', i) as string;
        const dataType = this.getNodeParameter('dataType', i) as string;
        const expiration = this.getNodeParameter('expiration', i) as number;

        let success = false;

        switch (dataType) {
          case 'string': {
            const value = this.getNodeParameter('value', i) as string;
            if (expiration > 0) {
              await redis.set(key, value, 'EX', expiration);
            } else {
              await redis.set(key, value);
            }
            success = true;
            break;
          }

          case 'json': {
            const value = this.getNodeParameter('value', i) as string;
            try {
              const jsonValue = JSON.parse(value);
              if (expiration > 0) {
                await redis.set(key, JSON.stringify(jsonValue), 'EX', expiration);
              } else {
                await redis.set(key, JSON.stringify(jsonValue));
              }
              success = true;
            } catch (error) {
              throw new NodeOperationError(this.getNode(), 'O valor fornecido não é um JSON válido');
            }
            break;
          }

          case 'hash': {
            const hashFields = this.getNodeParameter('hashFields.fields', i, []) as Array<{ field: string; value: string }>;
            if (hashFields.length === 0) {
              throw new NodeOperationError(this.getNode(), 'É necessário fornecer pelo menos um campo para o hash');
            }

            const hashData: Record<string, string> = {};
            for (const { field, value } of hashFields) {
              hashData[field] = value;
            }

            await redis.hset(key, hashData);
            if (expiration > 0) {
              await redis.expire(key, expiration);
            }
            success = true;
            break;
          }
        }

        returnData.push({
          json: {
            key,
            dataType,
            success,
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