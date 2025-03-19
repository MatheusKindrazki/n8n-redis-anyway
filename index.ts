import { INodeTypeData } from 'n8n-workflow';
import { RedisAnywaySetter } from './nodes/RedisAnyway/RedisAnywaySetter.node';
import { RedisAnywayGetter } from './nodes/RedisAnyway/RedisAnywayGetter.node';
import { RedisAnywayTest } from './nodes/RedisAnyway/RedisAnywayTest.node';
import { RedisAnywayRenewer } from './nodes/RedisAnyway/RedisAnywayRenewer.node';

export const nodeTypes: INodeTypeData = {
	redisAnywaySetter: {
		sourcePath: __dirname + '/nodes/RedisAnyway/RedisAnywaySetter.node.js',
		type: new RedisAnywaySetter()
	},
	redisAnywayGetter: {
		sourcePath: __dirname + '/nodes/RedisAnyway/RedisAnywayGetter.node.js',
		type: new RedisAnywayGetter()
	},
	redisAnywayTest: {
		sourcePath: __dirname + '/nodes/RedisAnyway/RedisAnywayTest.node.js',
		type: new RedisAnywayTest()
	},
	redisAnywayRenewer: {
		sourcePath: __dirname + '/nodes/RedisAnyway/RedisAnywayRenewer.node.js',
		type: new RedisAnywayRenewer()
	}
}; 