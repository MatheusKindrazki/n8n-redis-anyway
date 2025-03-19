# n8n-nodes-redis-anyway

This is an n8n community node that provides easy integration with Redis for caching data with expiration support and conditional workflow routing based on cache validity.

![Redis Anyway Node Example](https://example.com/redis-anyway-screenshot.png)

## Features

- **Store data in Redis** with a specified expiration time
- **Conditionally route workflows** based on whether a key exists and is valid (not expired)
- **JSON support** for storing and retrieving structured data
- **Simple configuration** - use familiar Redis connection parameters
- **Metadata output** to track cache hits, TTL, and other useful information

## Installation

Follow these steps to install this custom node:

### Community Nodes (Recommended)

1. Open your n8n instance
2. Go to **Settings > Community Nodes**
3. Select **Install**
4. Enter `n8n-nodes-redis-anyway` in the **npm package name** field
5. Agree to the risks of using community nodes
6. Click **Install**

### Manual Installation

If you prefer to install the node manually:

```bash
npm install n8n-nodes-redis-anyway
```

For Docker-based deployments, add the following line to your Dockerfile before the font installation command:

```
RUN cd /usr/local/lib/node_modules/n8n && npm install n8n-nodes-redis-anyway
```

## Usage

The Redis Anyway node package includes two nodes:

### 1. Redis Setter Node

Use this node to store data in Redis with an expiration time.

**Parameters:**

- **Key:** The Redis key to use for storing data
- **Value:** The data to store (string or JSON)
- **Expiration Time:** Time in seconds after which the key will expire
- **JSON Output:** Automatically stringify JSON data before storing

### 2. Redis Getter Node

Use this node to retrieve data from Redis and route workflow execution based on whether the key exists and is valid (not expired).

**Parameters:**

- **Key:** The Redis key to check and retrieve
- **Property Name:** The name of the property to store the retrieved data under
- **JSON Parse:** Automatically parse the value as JSON if checked
- **Include Metadata:** Add Redis metadata like TTL to the output

**Outputs:**

- **Cache Valid:** This output activates when the key exists and is not expired
- **Cache Invalid:** This output activates when the key doesn't exist or has expired

## Example Workflow

Here's a simple example of how to use the Redis Anyway nodes in a workflow:

1. **Trigger** (HTTP Request, Webhook, etc.)
2. **Redis Getter** - Check if data for a given ID is in Redis cache
   - If cache is valid → use cached data
   - If cache is invalid → fetch fresh data from API
3. **HTTP Request** - Call an API to get fresh data (only runs if cache is invalid)
4. **Redis Setter** - Store the API response in Redis for future use

## Redis Connection

To connect to your Redis instance, create a Redis Anyway credentials configuration with the following parameters:

- **Host:** Redis host (default: localhost)
- **Port:** Redis port (default: 6379)
- **Password:** Redis password (optional)
- **Database:** Redis database number (default: 0)
- **Use SSL:** Enable for secure connections
- **Username:** Redis username for ACL authentication (Redis 6+)

## License

[MIT](LICENSE.md) 