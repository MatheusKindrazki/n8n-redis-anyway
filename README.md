# n8n-nodes-redis-anyway

[![npm version](https://badge.fury.io/js/n8n-nodes-redis-anyway.svg)](https://badge.fury.io/js/n8n-nodes-redis-anyway)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive Redis integration for [n8n](https://n8n.io/) that provides intelligent cache management with automatic renewal capabilities, database selection, and advanced data manipulation features.

## ✨ Features

- **🎯 Smart Cache Management**: Store, retrieve, and manipulate cached data with intelligent expiration handling
- **🔄 Automatic Cache Renewal**: Proactive cache refresh based on configurable thresholds
- **🗄️ Database Selection**: Support for Redis databases 0-15 with credential-level configuration
- **📊 Multiple Data Types**: Support for strings, JSON objects, and Redis hashes
- **🔧 Advanced Manipulation**: Partial updates, array operations, and field-level modifications
- **⚡ Async Connection Handling**: Reliable connection management with proper ready-state checking
- **🛡️ Error Resilience**: Robust error handling and connection retry mechanisms

## 🚀 Quick Start

### Installation

#### Via n8n Community Nodes (Recommended)

1. Go to **Settings > Community Nodes** in your n8n instance
2. Click **Install**
3. Enter `n8n-nodes-redis-anyway`
4. Click **Install**

#### Manual Installation

```bash
# Clone the repository
git clone https://github.com/matheuskindrazki/n8n-redis-anyway.git
cd n8n-redis-anyway

# Install dependencies
pnpm install

# Build the package
pnpm build

# Copy to n8n custom nodes directory
cp -r dist ~/.n8n/custom/
```

### Redis Credentials Setup

1. In n8n, go to **Credentials > Add Credential**
2. Select **Redis**
3. Configure your connection:

```yaml
Host: your-redis-host      # e.g., localhost, redis.example.com
Port: 6379                 # Default Redis port
Database: 0                # Redis database number (0-15)
Username: your-username    # Optional (Redis 6.0+)
Password: your-password    # Optional
Use TLS/SSL: false         # Enable for secure connections
```

## 📦 Available Nodes

### 1. Redis Set Cache

Store data in Redis with configurable expiration and data type support.

**Supported Data Types:**
- **String**: Simple text or numeric values
- **JSON**: Complex objects and arrays
- **Hash**: Key-value field collections

**Configuration:**
```yaml
Key: "user:123:profile"           # Unique identifier
Data Type: "json"                 # string, json, or hash
Value: '{"name":"John","age":30}' # Data to store
Expiration: 3600                  # Seconds (0 = never expires)
```

**Example Flow:**
```
[HTTP Request] → [Redis Set Cache] → [Continue Workflow]
```

### 2. Redis Get Cache

Retrieve cached data with intelligent expiration detection and renewal triggers.

**Configuration:**
```yaml
Key: "user:123:profile"    # Key to retrieve
Renewal Threshold: 300     # Seconds before expiration to trigger renewal
```

**Three Output Paths:**
1. **Valid Cache**: Data exists and is fresh
2. **Invalid Cache**: Data missing or expired
3. **Needs Renewal**: Data exists but approaching expiration

**Smart Caching Flow Example:**
```
[Trigger] → [Redis Get Cache]
              ├─ Valid Cache → [Use Data] → [Response]
              ├─ Invalid Cache → [Fetch from API] → [Redis Set Cache] → [Response]
              └─ Needs Renewal → [Background Refresh] → [Redis Set Cache]
                              └─ [Use Current Data] → [Response]
```

### 3. Redis Manipulate Cache

Perform partial updates on existing cached data without full replacement.

**Operations:**
- **Update JSON Field**: Modify specific object properties
- **Update Hash Field**: Change individual hash fields
- **Append to JSON Array**: Add items to arrays
- **Remove from JSON Array**: Remove items from arrays

**Configuration:**
```yaml
Key: "user:123:profile"       # Target key
Operation: "updateJsonField"  # Type of manipulation
Field Path: "user.preferences" # Dot notation for nested fields
New Value: '{"theme":"dark"}'  # New value (JSON or string)
Preserve TTL: true            # Maintain original expiration
```

## 🔧 Advanced Configuration

### Database Selection

Redis supports multiple databases (0-15). Configure this in your Redis credentials:

```yaml
Database: 4  # Your cached data will be stored in database 4
```

**Verification:**
```bash
# Connect to specific database and verify
redis-cli -h your-host -p 6379 -n 4 KEYS "*"
```

### Connection Options

The plugin automatically configures optimal connection settings:

```typescript
{
  maxRetriesPerRequest: 1,    // Prevent multiple retries per operation
  connectTimeout: 15000,      // 15-second connection timeout
  commandTimeout: 10000,      # 10-second command timeout
  enableOfflineQueue: false,  # Fail fast when disconnected
  enableReadyCheck: true,     # Wait for ready state
}
```

## 🏗️ Development & Testing

### Local Development Setup

```bash
# Clone and setup
git clone https://github.com/matheuskindrazki/n8n-redis-anyway.git
cd n8n-redis-anyway
pnpm install

# Development workflow
pnpm build              # Build the package
pnpm test              # Run tests (if available)
pnpm lint              # Check code quality
```

### Docker Testing Environment

We provide a complete testing environment with Docker:

```bash
# Make script executable
chmod +x scripts/test-environment.sh

# Start n8n + Redis environment
./scripts/test-environment.sh start

# Access n8n at http://localhost:5678
# Redis credentials: host=redis, port=6379

# Rebuild after changes
./scripts/test-environment.sh rebuild

# Stop environment
./scripts/test-environment.sh stop
```

## 🔍 Troubleshooting

### Common Issues

#### 1. "Stream isn't writeable" Error
**Solution**: Update to latest version. We've implemented async connection handling that waits for the Redis connection to be fully ready.

#### 2. "SECURITY ATTACK detected" in Redis Logs
**Solution**: This was caused by HTTP-based connection testing. Fixed in latest version by removing problematic connection tests.

#### 3. Data Writing to Wrong Database
**Solution**: Ensure the `Database` field is set in your Redis credentials. The plugin now properly respects database selection.

#### 4. Connection Timeouts
**Solution**: Check your Redis server accessibility and credentials. The plugin includes comprehensive retry logic and timeout handling.

### Debug Information

Enable debug logging to troubleshoot connection issues:

```typescript
// Connection logs will show:
Redis connection options: {
  host: "your-host",
  port: 6379,
  db: 4,                    // Database number
  username: "(set)",
  password: "(set)",
  tls: "(disabled)"
}
```

## 📚 Use Cases & Examples

### 1. API Response Caching

```yaml
# Workflow: Cache API responses with smart refresh
Trigger → Get Cache → Valid? → Return Cached Data
                   → Invalid? → Call API → Set Cache → Return Fresh Data
                   → Renewal? → Background API Call → Update Cache
                             → Return Current Data
```

### 2. User Session Management

```yaml
# Store user sessions with automatic cleanup
User Login → Set Cache (key: "session:user123", expiration: 3600)
Page Request → Get Cache → Valid? → Continue
                        → Invalid? → Redirect to Login
```

### 3. Real-time Data Aggregation

```yaml
# Accumulate data with partial updates
New Event → Manipulate Cache (operation: "appendJsonArray")
Dashboard → Get Cache → Display Aggregated Data
```

### 4. Multi-Environment Data Isolation

```yaml
# Use different databases for environments
Development: Database 0
Staging: Database 1
Production: Database 2
Cache Analytics: Database 3
```

## 🤝 Contributing

We welcome contributions! Please feel free to:

1. **Report Issues**: Use GitHub Issues for bugs and feature requests
2. **Submit PRs**: Fork, create a feature branch, and submit a pull request
3. **Improve Documentation**: Help us make the docs even better
4. **Share Use Cases**: Tell us how you're using the plugin

### Development Guidelines

- Follow TypeScript best practices
- Include tests for new features
- Update documentation for changes
- Use conventional commits

## 📝 Changelog

### Latest Release

- ✅ **Database Selection**: Full support for Redis databases 0-15
- ✅ **Async Connection Handling**: Eliminates "Stream isn't writeable" errors
- ✅ **Security Fix**: Removed problematic HTTP connection tests
- ✅ **Enhanced Error Handling**: Better error messages and retry logic
- ✅ **Improved Logging**: Detailed connection and operation information

## 📄 License

MIT License - see [LICENSE.md](LICENSE.md) for details.

## 👨‍💻 Author

**Matheus Kindrazki**
- Email: matheus@kindrazki.dev
- GitHub: [@matheuskindrazki](https://github.com/matheuskindrazki)

## 🔗 Links

- [n8n Community](https://community.n8n.io/)
- [Redis Documentation](https://redis.io/documentation)
- [Issues & Support](https://github.com/matheuskindrazki/n8n-redis-anyway/issues)

---

⭐ **Star this repository if it helps your workflow!** 
