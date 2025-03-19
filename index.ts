import { INodeTypeData } from 'n8n-workflow';
import { RedisAnywaySetter, RedisAnywayGetter } from './nodes/RedisAnyway';

export const nodeTypes: INodeTypeData = {
	redisAnywaySetter: {
		sourcePath: __dirname + '/nodes/RedisAnyway/RedisAnywaySetter.node.js',
		type: new RedisAnywaySetter()
	},
	redisAnywayGetter: {
		sourcePath: __dirname + '/nodes/RedisAnyway/RedisAnywayGetter.node.js',
		type: new RedisAnywayGetter()
	}
}; 