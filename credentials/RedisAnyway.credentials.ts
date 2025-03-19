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
			description: 'Endereço do servidor Redis ou URL completa no formato redis://[[user][:password@]]host[:port][/db-number]',
			placeholder: 'localhost ou redis://localhost:6379',
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 6379,
			description: 'Porta do servidor Redis (ignorado se o Host for uma URL completa)',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: false,
			description: 'Senha do Redis (opcional, pode ser incluída na URL se Host for uma URL completa)',
		},
		{
			displayName: 'Database',
			name: 'database',
			type: 'number',
			default: 0,
			description: 'Número da base de dados Redis (ignorado se o Host for uma URL completa que já inclui o DB)',
		},
		{
			displayName: 'Use SSL',
			name: 'ssl',
			type: 'boolean',
			default: false,
			description: 'Se habilitado, usará SSL/TLS para conexão. Use rediss:// no início da URL se estiver fornecendo uma URL completa',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			description: 'Nome de usuário para autenticação no Redis 6+ (opcional, pode ser incluído na URL se Host for uma URL completa)',
			required: false,
		},
	];
} 