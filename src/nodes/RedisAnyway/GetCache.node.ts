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
    description: 'Retrieve data from Redis with expiration check',
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
        required: true,
        description: 'Key to retrieve the data from',
      },
      {
        displayName: 'Renewal Threshold (seconds)',
        name: 'threshold',
        type: 'number',
        default: 300,
        required: true,
        description: 'Time in seconds before expiration to trigger renewal',
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
      
      RedisConnection.initialize({
        host: credentials.host as string,
        port: credentials.port as number,
        password: credentials.password as string,
      });

      const redis = RedisConnection.getInstance();

      for (let i = 0; i < items.length; i++) {
        const key = this.getNodeParameter('key', i) as string;
        const threshold = this.getNodeParameter('threshold', i) as number;

        const [value, ttl] = await Promise.all([
          redis.get(key),
          redis.ttl(key),
        ]);

        if (value === null || ttl === -2) {
          // Key doesn't exist or has expired
          invalidCache.push({
            json: {
              key,
              exists: false,
              ttl: -1,
            } as IDataObject,
          });
          continue;
        }

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
            ttl,
            exists: true,
          } as IDataObject,
        };

        if (ttl <= threshold && ttl > 0) {
          // Cache exists but needs renewal
          validCache.push(result);
          needsRenewal.push(result);
        } else {
          // Cache is valid and not near expiration
          validCache.push(result);
        }
      }

      return [validCache, invalidCache, needsRenewal];
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new NodeOperationError(this.getNode(), error.message);
      }
      throw new NodeOperationError(this.getNode(), 'An unknown error occurred');
    }
  }
} 