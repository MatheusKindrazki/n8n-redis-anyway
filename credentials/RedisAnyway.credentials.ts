import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class RedisAnyway implements ICredentialType {
	name = 'redisAnyway';
	displayName = 'Redis Anyway';
	documentationUrl = 'https://github.com/matheuskindrazki/n8n-redis-anyway';
	properties: INodeProperties[] = [
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: 'localhost',
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 6379,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
		},
		{
			displayName: 'Database',
			name: 'database',
			type: 'number',
			default: 0,
			description: 'The Redis database number',
		},
		{
			displayName: 'Use SSL',
			name: 'ssl',
			type: 'boolean',
			default: false,
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			description: 'Used for Redis 6+ ACL authentication',
			required: false,
		},
	];
} 