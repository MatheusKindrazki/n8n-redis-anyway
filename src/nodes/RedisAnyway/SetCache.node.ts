import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  NodeConnectionType,
} from 'n8n-workflow';
import { RedisConnection } from './RedisConnection';

const NodeConnectionTypeValue = {
  AiAgent: "ai_agent",
  AiChain: "ai_chain",
  AiDocument: "ai_document",
  AiEmbedding: "ai_embedding",
  AiLanguageModel: "ai_languageModel",
  AiMemory: "ai_memory",
  AiOutputParser: "ai_outputParser",
  AiRetriever: "ai_retriever",
  AiTextSplitter: "ai_textSplitter",
  AiTool: "ai_tool",
  AiVectorStore: "ai_vectorStore",
  Main: "main"
} as const;

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
    inputs: [{ type: NodeConnectionTypeValue.Main as NodeConnectionType }],
    outputs: [{ type: NodeConnectionTypeValue.Main as NodeConnectionType }],
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
      {
        displayName: 'Return the value back',
        name: 'returnBackValue',
        type: 'boolean',
        default: false,
        required: true,
        description: '',
        hint: '',
      },
      {
        displayName: 'Return the value even if unsuccessful',
        name: 'returnBackValueAlways',
        type: 'boolean',
        default: false,
        required: true,
        description: '',
        hint: '',
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
        username: credentials.username !== 'DEFAULT' ? credentials.username as string : undefined,
        password: credentials.password ? credentials.password as string : undefined,
        tls: credentials.useTls === true ? {} : undefined,
        db: credentials.database as number,
      };
      
      RedisConnection.initialize(redisOptions);
      const redis = RedisConnection.getInstance();
      
      for (let i = 0; i < items.length; i++) {
        const returnBackValueAlways = this.getNodeParameter("returnBackValueAlways", i) as boolean;
        const returnBackValue = this.getNodeParameter("returnBackValue", i) as boolean;
        const key = this.getNodeParameter('key', i) as string;
        const dataType = this.getNodeParameter('dataType', i) as string;
        const expiration = this.getNodeParameter('expiration', i) as number;

        let success = false;
        let value = undefined;

        switch (dataType) {
          case 'string': {
            value = this.getNodeParameter('value', i) as string;
            if (expiration > 0) {
              await redis.set(key, value, 'EX', expiration);
            } else {
              await redis.set(key, value);
            }
            success = true;
            break;
          }

          case 'json': {
            const rawValue = this.getNodeParameter('value', i) as string;
            try {
              value = JSON.parse(rawValue);
              if (expiration > 0) {
                await redis.set(key, JSON.stringify(value), 'EX', expiration);
              } else {
                await redis.set(key, JSON.stringify(value));
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
            timestamp: new Date().toISOString(),
            value:
              returnBackValue && (success || returnBackValueAlways)
                ? value
                : undefined,
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