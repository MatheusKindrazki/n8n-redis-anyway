import {
  ICredentialTestFunctions,
  INodeCredentialTestResult,
  ICredentialsDecrypted,
} from 'n8n-workflow';

import IORedis from 'ioredis';

export async function redisConnectionTest(
  this: ICredentialTestFunctions,
  credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
  try {
    const client = new IORedis(credential);
    await client.connect();
    await client.ping();
    return {
      status: 'OK',
      message: 'Connection successful!',
    };
  } catch (error) {
    return {
      status: 'Error',
      message: `${error}`,
    };
  }
}
