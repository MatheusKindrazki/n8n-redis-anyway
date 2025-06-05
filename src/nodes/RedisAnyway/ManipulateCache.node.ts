import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  NodeConnectionType,
} from 'n8n-workflow';
import { RedisConnection } from './RedisConnection';

export class ManipulateCache implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Redis Manipulate Cache',
    name: 'manipulateCache',
    icon: 'file:redis.svg',
    group: ['transform'],
    version: 1,
    description: 'Manipula dados existentes no Redis de forma parcial',
    subtitle: '={{$parameter["operation"]}}',
    defaults: {
      name: 'Manipulate Cache',
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
        description: 'Chave do Redis que contém os dados a serem manipulados',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        options: [
          {
            name: 'Update JSON Field',
            value: 'updateJsonField',
            description: 'Atualiza um campo específico em um objeto JSON',
          },
          {
            name: 'Update Hash Field',
            value: 'updateHashField',
            description: 'Atualiza um campo específico em um hash',
          },
          {
            name: 'Append to JSON Array',
            value: 'appendJsonArray',
            description: 'Adiciona um item a um array dentro de um objeto JSON',
          },
          {
            name: 'Remove from JSON Array',
            value: 'removeJsonArray',
            description: 'Remove um item de um array dentro de um objeto JSON',
          },
        ],
        default: 'updateJsonField',
        required: true,
        description: 'Operação a ser realizada nos dados',
      },
      {
        displayName: 'Field Path',
        name: 'fieldPath',
        type: 'string',
        default: '',
        placeholder: 'user.name ou items[0].title',
        description: 'Caminho do campo a ser atualizado (use notação de ponto para campos aninhados)',
        displayOptions: {
          show: {
            operation: ['updateJsonField', 'appendJsonArray', 'removeJsonArray'],
          },
        },
        required: true,
      },
      {
        displayName: 'Field Name',
        name: 'fieldName',
        type: 'string',
        default: '',
        placeholder: 'name',
        description: 'Nome do campo no hash a ser atualizado',
        displayOptions: {
          show: {
            operation: ['updateHashField'],
          },
        },
        required: true,
      },
      {
        displayName: 'New Value',
        name: 'newValue',
        type: 'string',
        default: '',
        description: 'Novo valor para o campo (use JSON válido se necessário)',
        displayOptions: {
          show: {
            operation: ['updateJsonField', 'updateHashField', 'appendJsonArray'],
          },
        },
        required: true,
      },
      {
        displayName: 'Preserve TTL',
        name: 'preserveTtl',
        type: 'boolean',
        default: true,
        description: 'Se verdadeiro, mantém o tempo de expiração original do dado',
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
        db: credentials.database ? parseInt(credentials.database as string, 10) : 0,
        username: credentials.username !== 'DEFAULT' ? credentials.username as string : undefined,
        password: credentials.password ? credentials.password as string : undefined,
        tls: credentials.useTls === true ? {} : undefined,
      };
      
      RedisConnection.initialize(redisOptions);
      const redis = RedisConnection.getInstance();

      for (let i = 0; i < items.length; i++) {
        const key = this.getNodeParameter('key', i) as string;
        const operation = this.getNodeParameter('operation', i) as string;
        const preserveTtl = this.getNodeParameter('preserveTtl', i) as boolean;

        // Verifica se a chave existe
        const exists = await redis.exists(key);
        if (!exists) {
          throw new NodeOperationError(this.getNode(), `A chave "${key}" não existe no Redis`);
        }

        // Se preserveTtl for true, obtém o TTL atual
        let currentTtl = -1;
        if (preserveTtl) {
          currentTtl = await redis.ttl(key);
        }

        let success = false;
        let result: any;

        switch (operation) {
          case 'updateJsonField': {
            const fieldPath = this.getNodeParameter('fieldPath', i) as string;
            const newValue = this.getNodeParameter('newValue', i) as string;
            
            const currentData = await redis.get(key);
            if (!currentData) {
              throw new NodeOperationError(this.getNode(), 'Dados não encontrados');
            }

            try {
              const jsonData = JSON.parse(currentData);
              const pathParts = fieldPath.split('.');
              
              let current = jsonData;
              for (let j = 0; j < pathParts.length - 1; j++) {
                const part = pathParts[j];
                if (!(part in current)) {
                  current[part] = {};
                }
                current = current[part];
              }

              const lastPart = pathParts[pathParts.length - 1];
              try {
                current[lastPart] = JSON.parse(newValue);
              } catch {
                current[lastPart] = newValue;
              }

              await redis.set(key, JSON.stringify(jsonData));
              if (preserveTtl && currentTtl > 0) {
                await redis.expire(key, currentTtl);
              }

              success = true;
              result = jsonData;
            } catch (error) {
              throw new NodeOperationError(this.getNode(), 'Falha ao manipular JSON: ' + (error as Error).message);
            }
            break;
          }

          case 'updateHashField': {
            const fieldName = this.getNodeParameter('fieldName', i) as string;
            const newValue = this.getNodeParameter('newValue', i) as string;

            await redis.hset(key, fieldName, newValue);
            if (preserveTtl && currentTtl > 0) {
              await redis.expire(key, currentTtl);
            }

            success = true;
            result = await redis.hgetall(key);
            break;
          }

          case 'appendJsonArray': {
            const fieldPath = this.getNodeParameter('fieldPath', i) as string;
            const newValue = this.getNodeParameter('newValue', i) as string;
            
            const currentData = await redis.get(key);
            if (!currentData) {
              throw new NodeOperationError(this.getNode(), 'Dados não encontrados');
            }

            try {
              const jsonData = JSON.parse(currentData);
              const pathParts = fieldPath.split('.');
              
              let current = jsonData;
              for (let j = 0; j < pathParts.length - 1; j++) {
                const part = pathParts[j];
                if (!(part in current)) {
                  current[part] = {};
                }
                current = current[part];
              }

              const lastPart = pathParts[pathParts.length - 1];
              if (!Array.isArray(current[lastPart])) {
                current[lastPart] = [];
              }

              try {
                current[lastPart].push(JSON.parse(newValue));
              } catch {
                current[lastPart].push(newValue);
              }

              await redis.set(key, JSON.stringify(jsonData));
              if (preserveTtl && currentTtl > 0) {
                await redis.expire(key, currentTtl);
              }

              success = true;
              result = jsonData;
            } catch (error) {
              throw new NodeOperationError(this.getNode(), 'Falha ao manipular array JSON: ' + (error as Error).message);
            }
            break;
          }

          case 'removeJsonArray': {
            const fieldPath = this.getNodeParameter('fieldPath', i) as string;
            
            const currentData = await redis.get(key);
            if (!currentData) {
              throw new NodeOperationError(this.getNode(), 'Dados não encontrados');
            }

            try {
              const jsonData = JSON.parse(currentData);
              const pathParts = fieldPath.split('.');
              
              let current = jsonData;
              for (let j = 0; j < pathParts.length - 1; j++) {
                const part = pathParts[j];
                if (!(part in current)) {
                  throw new NodeOperationError(this.getNode(), `Caminho "${fieldPath}" não encontrado`);
                }
                current = current[part];
              }

              const lastPart = pathParts[pathParts.length - 1];
              if (!Array.isArray(current[lastPart])) {
                throw new NodeOperationError(this.getNode(), `O campo "${lastPart}" não é um array`);
              }

              current[lastPart].pop();

              await redis.set(key, JSON.stringify(jsonData));
              if (preserveTtl && currentTtl > 0) {
                await redis.expire(key, currentTtl);
              }

              success = true;
              result = jsonData;
            } catch (error) {
              throw new NodeOperationError(this.getNode(), 'Falha ao manipular array JSON: ' + (error as Error).message);
            }
            break;
          }
        }

        returnData.push({
          json: {
            key,
            operation,
            success,
            result,
            preservedTtl: preserveTtl ? currentTtl : null,
            timestamp: new Date().toISOString()
          },
        });
      }

      return [returnData];
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new NodeOperationError(this.getNode(), `Erro ao manipular dados no Redis: ${error.message}`);
      }
      throw new NodeOperationError(this.getNode(), 'Ocorreu um erro desconhecido');
    }
  }
} 