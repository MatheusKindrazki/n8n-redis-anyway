import {
  IAuthenticateGeneric,
  ICredentialType,
  INodeProperties,
} from "n8n-workflow";

export class Redis implements ICredentialType {
  name = 'redis';
  displayName = 'Redis';
  documentationUrl = 'https://github.com/matheuskindrazki/n8n-redis-anyway';
  properties: INodeProperties[] = [
    {
      displayName: 'Host',
      name: 'host',
      type: 'string',
      default: 'localhost',
      required: true,
      description: 'Hostname ou endereço IP do servidor Redis',
    },
    {
      displayName: 'Port',
      name: 'port',
      type: 'number',
      default: 6379,
      required: true,
      description: 'Porta do servidor Redis (padrão: 6379)',
    },
    {
      displayName: 'Username',
      name: 'username',
      type: 'string',
      default: 'DEFAULT',
      required: false,
      description: 'Nome de usuário do Redis (a partir do Redis 6.0). Use DEFAULT para conexões sem usuário específico',
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
      description: 'Senha do Redis. Deixe em branco para conexões sem senha',
    },
    {
      displayName: 'Database',
      name: 'database',
      type: 'number',
      default: 0,
      required: false,
      description: 'Número do database Redis (0-15). Padrão: 0',
      hint: 'Redis suporta múltiplos databases numerados de 0 a 15',
    },
    {
      displayName: 'Use TLS/SSL',
      name: 'useTls',
      type: 'boolean',
      default: false,
      description: 'Ativar conexão segura via TLS/SSL',
    }
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {},
  };

  // Teste de conexão removido para evitar problemas de Cross Protocol Scripting
  // O teste de conectividade será feito diretamente pelos nós durante a execução
} 