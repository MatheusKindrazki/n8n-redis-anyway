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
    description: 'Store data in Redis with expiration',
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
        required: true,
        description: 'Key to store the data under',
      },
      {
        displayName: 'Value',
        name: 'value',
        type: 'string',
        default: '',
        required: true,
        description: 'Value to store (supports JSON)',
      },
      {
        displayName: 'Expiration (seconds)',
        name: 'expiration',
        type: 'number',
        default: 3600,
        required: true,
        description: 'Time in seconds after which the data will expire',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    try {
      const credentials = await this.getCredentials('redis');
      
      RedisConnection.initialize({
        host: credentials.host as string,
        port: credentials.port as number,
        password: credentials.password as string,
      });

      const redis = RedisConnection.getInstance();

      for (let i = 0; i < items.length; i++) {
        const key = this.getNodeParameter('key', i) as string;
        const value = this.getNodeParameter('value', i) as string;
        const expiration = this.getNodeParameter('expiration', i) as number;

        try {
          const jsonValue = JSON.parse(value);
          await redis.set(key, JSON.stringify(jsonValue), 'EX', expiration);
        } catch {
          // If value is not valid JSON, store it as a string
          await redis.set(key, value, 'EX', expiration);
        }

        returnData.push({
          json: {
            key,
            success: true,
            expiresIn: expiration,
          },
        });
      }

      return [returnData];
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new NodeOperationError(this.getNode(), error.message);
      }
      throw new NodeOperationError(this.getNode(), 'An unknown error occurred');
    }
  }
} 