# n8n-nodes-redis-anyway

This is a node for [n8n](https://n8n.io/) that provides intelligent Redis cache management with automatic renewal capabilities.

## Features

- Store data in Redis with configurable expiration
- Retrieve cached data with automatic expiration checks
- Proactive cache renewal based on configurable thresholds
- Support for JSON data structures
- Simple and intuitive interface

## Installation

### In n8n:

1. Go to **Settings > Community Nodes**
2. Click on **Install**
3. Enter `n8n-nodes-redis-anyway` in the input field
4. Click on **Install**

### Manual Installation:

1. Clone this repository
2. Install dependencies: `pnpm install`
3. Build: `pnpm build`
4. Copy `dist` folder to n8n custom nodes directory (usually `~/.n8n/custom`)

### Testing with Docker

We provide a convenient script to manage the test environment. First, make the script executable:

```bash
chmod +x scripts/test-environment.sh
```

### Starting the Environment

This will build the plugin and start n8n with Redis:

```bash
./scripts/test-environment.sh start
```

The script will:
1. Check if pnpm is installed (and install if needed)
2. Check if Docker is running
3. Build the plugin
4. Start n8n and Redis containers
5. Display the necessary Redis credentials

### Accessing n8n

Once started, access n8n at http://localhost:5678

Use these Redis credentials in n8n:
- Host: `redis`
- Port: `6379`
- Password: (leave empty)

### Rebuilding the Plugin

If you make changes to the plugin code, rebuild it with:

```bash
./scripts/test-environment.sh rebuild
```

### Stopping the Environment

To stop n8n and Redis:

```bash
./scripts/test-environment.sh stop
```

## Nodes

### Redis Set Cache

This node allows you to store data in Redis with a specified expiration time.

#### Configuration

- **Key**: The key under which to store the data
- **Value**: The value to store (supports JSON)
- **Expiration**: Time in seconds after which the data will expire

#### Example

```json
{
  "key": "user:123",
  "value": "{\"name\":\"John\",\"age\":30}",
  "expiration": 3600
}
```

### Redis Get Cache

This node retrieves data from Redis and provides three possible outputs based on the cache state.

#### Configuration

- **Key**: The key to retrieve data from
- **Renewal Threshold**: Time in seconds before expiration to trigger renewal

#### Outputs

1. **Valid Cache**: Contains the cached data if it exists and is not expired
2. **Invalid Cache**: Triggered when the cache is expired or doesn't exist
3. **Needs Renewal**: Triggered when the cache is valid but close to expiration (based on threshold)

#### Example Flow

```plaintext
[HTTP Request] -> [Redis Get Cache]
                    |
                    ├─> [Valid Cache] -> [Use Data]
                    |
                    ├─> [Invalid Cache] -> [Fetch New Data] -> [Redis Set Cache]
                    |
                    └─> [Needs Renewal] -> [Background Fetch] -> [Redis Set Cache]
```

## Redis Connection

Configure your Redis connection in n8n's credentials:

1. Go to **Credentials**
2. Click **Add Credential**
3. Select **Redis**
4. Fill in:
   - Host (default: localhost)
   - Port (default: 6379)
   - Password (optional)

## Development

1. Clone repository
2. Install dependencies: `pnpm install`
3. Build: `pnpm build`
4. Link to n8n: `pnpm link`
5. Start n8n: `n8n start`

## License

MIT

## Author

Matheus Kindrazki (kindra.fireflies@gmail.com) 