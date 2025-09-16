// app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');

// OpenTelemetry setup (debe ir antes de importar otras librerías)
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

// Configuración de OpenTelemetry
const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'express-metrics-api',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://otel-collector:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://otel-collector:4318/v1/metrics',
    }),
    exportIntervalMillis: 5000,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

// Inicializar OpenTelemetry
sdk.start();

// Importar métricas manuales
const { trace, metrics } = require('@opentelemetry/api');

// Crear métricas personalizadas
const meter = metrics.getMeter('express-metrics-api', '1.0.0');

const requestCounter = meter.createCounter('api_requests_total', {
  description: 'Total number of API requests',
});

const requestDuration = meter.createHistogram('api_request_duration_seconds', {
  description: 'Duration of API requests in seconds',
});

const activeConnections = meter.createUpDownCounter('api_active_connections', {
  description: 'Number of active connections',
});

const businessMetrics = {
  usersCreated: meter.createCounter('api_users_created_total', {
    description: 'Total number of users created',
  }),
  usersDeleted: meter.createCounter('api_users_deleted_total', {
    description: 'Total number of users deleted',
  }),
};

// Configurar Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logger personalizado con métricas
app.use(morgan('combined', {
  stream: {
    write: (message) => {
      console.log(message.trim());
    }
  }
}));

// Middleware para métricas
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Incrementar conexiones activas
  activeConnections.add(1);
  
  // Obtener span actual para agregar atributos
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes({
      'http.method': req.method,
      'http.route': req.route?.path || req.path,
      'user.agent': req.get('User-Agent') || 'unknown',
    });
  }

  // Interceptar el final de la respuesta
  const originalSend = res.send;
  res.send = function(data) {
    const duration = (Date.now() - startTime) / 1000;
    
    // Registrar métricas
    requestCounter.add(1, {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode.toString(),
    });
    
    requestDuration.record(duration, {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode.toString(),
    });
    
    // Decrementar conexiones activas
    activeConnections.add(-1);
    
    // Agregar atributos al span
    if (span) {
      span.setAttributes({
        'http.status_code': res.statusCode,
        'http.response.duration_ms': Date.now() - startTime,
      });
    }
    
    return originalSend.call(this, data);
  };
  
  next();
});

// Base de datos en memoria para demo
let users = [
  { id: '1', name: 'John Doe', email: 'john@example.com', age: 30, createdAt: new Date() },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com', age: 25, createdAt: new Date() },
];

// Routes

// Health Check
app.get('/health', (req, res) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent('Health check requested');
  }
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Métricas endpoint (Prometheus format)
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`# HELP api_requests_total Total number of API requests
# TYPE api_requests_total counter
api_requests_total{method="GET",route="/users"} 10
api_requests_total{method="POST",route="/users"} 5

# HELP api_active_connections Number of active connections
# TYPE api_active_connections gauge
api_active_connections 3

# HELP api_users_created_total Total number of users created
# TYPE api_users_created_total counter
api_users_created_total ${users.length}
`);
});

// Get all users
app.get('/users', (req, res) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent('Fetching all users', { count: users.length });
  }
  
  // Simular latencia variable
  const delay = Math.random() * 100;
  setTimeout(() => {
    res.json({
      success: true,
      data: users,
      total: users.length,
    });
  }, delay);
});

// Get user by ID
app.get('/users/:id', (req, res) => {
  const { id } = req.params;
  const span = trace.getActiveSpan();
  
  if (span) {
    span.setAttributes({ 'user.id': id });
    span.addEvent('Searching for user');
  }
  
  const user = users.find(u => u.id === id);
  
  if (!user) {
    if (span) {
      span.addEvent('User not found');
      span.setStatus({ code: 2, message: 'User not found' }); // ERROR status
    }
    return res.status(404).json({
      success: false,
      error: 'User not found',
    });
  }
  
  if (span) {
    span.addEvent('User found', { user_name: user.name });
  }
  
  res.json({
    success: true,
    data: user,
  });
});

// Create user
app.post('/users', (req, res) => {
  const { name, email, age } = req.body;
  const span = trace.getActiveSpan();
  
  // Validación básica
  if (!name || !email || !age) {
    if (span) {
      span.addEvent('Validation failed', { missing_fields: true });
      span.setStatus({ code: 2, message: 'Missing required fields' });
    }
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: name, email, age',
    });
  }
  
  // Verificar email duplicado
  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    if (span) {
      span.addEvent('Email already exists');
      span.setStatus({ code: 2, message: 'Email already exists' });
    }
    return res.status(409).json({
      success: false,
      error: 'Email already exists',
    });
  }
  
  // Crear usuario
  const newUser = {
    id: uuidv4(),
    name,
    email,
    age: parseInt(age),
    createdAt: new Date(),
  };
  
  users.push(newUser);
  
  // Métricas de negocio
  businessMetrics.usersCreated.add(1, {
    source: 'api',
    environment: process.env.NODE_ENV || 'development',
  });
  
  if (span) {
    span.addEvent('User created successfully', {
      user_id: newUser.id,
      user_name: newUser.name,
    });
    span.setAttributes({
      'user.created.id': newUser.id,
      'user.created.name': newUser.name,
    });
  }
  
  res.status(201).json({
    success: true,
    data: newUser,
    message: 'User created successfully',
  });
});

// Update user
app.put('/users/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, age } = req.body;
  const span = trace.getActiveSpan();
  
  if (span) {
    span.setAttributes({ 'user.id': id });
  }
  
  const userIndex = users.findIndex(u => u.id === id);
  
  if (userIndex === -1) {
    if (span) {
      span.addEvent('User not found for update');
      span.setStatus({ code: 2, message: 'User not found' });
    }
    return res.status(404).json({
      success: false,
      error: 'User not found',
    });
  }
  
  // Actualizar campos
  if (name) users[userIndex].name = name;
  if (email) users[userIndex].email = email;
  if (age) users[userIndex].age = parseInt(age);
  users[userIndex].updatedAt = new Date();
  
  if (span) {
    span.addEvent('User updated successfully', {
      user_id: id,
      updated_fields: { name: !!name, email: !!email, age: !!age },
    });
  }
  
  res.json({
    success: true,
    data: users[userIndex],
    message: 'User updated successfully',
  });
});

// Delete user
app.delete('/users/:id', (req, res) => {
  const { id } = req.params;
  const span = trace.getActiveSpan();
  
  if (span) {
    span.setAttributes({ 'user.id': id });
  }
  
  const userIndex = users.findIndex(u => u.id === id);
  
  if (userIndex === -1) {
    if (span) {
      span.addEvent('User not found for deletion');
      span.setStatus({ code: 2, message: 'User not found' });
    }
    return res.status(404).json({
      success: false,
      error: 'User not found',
    });
  }
  
  const deletedUser = users.splice(userIndex, 1)[0];
  
  // Métricas de negocio
  businessMetrics.usersDeleted.add(1, {
    source: 'api',
    environment: process.env.NODE_ENV || 'development',
  });
  
  if (span) {
    span.addEvent('User deleted successfully', {
      user_id: id,
      user_name: deletedUser.name,
    });
  }
  
  res.json({
    success: true,
    message: 'User deleted successfully',
    data: deletedUser,
  });
});

// Endpoint para generar errores (para testing)
app.get('/error', (req, res) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent('Intentional error triggered');
    span.setStatus({ code: 2, message: 'Intentional error for testing' });
  }
  
  throw new Error('This is a test error for monitoring');
});

// Endpoint para simular carga
app.get('/load-test', (req, res) => {
  const span = trace.getActiveSpan();
  const iterations = Math.floor(Math.random() * 1000000) + 100000;
  
  if (span) {
    span.addEvent('Load test started', { iterations });
  }
  
  // Simular trabajo CPU intensivo
  let result = 0;
  for (let i = 0; i < iterations; i++) {
    result += Math.random();
  }
  
  if (span) {
    span.addEvent('Load test completed', { result: result.toFixed(2) });
  }
  
  res.json({
    success: true,
    message: 'Load test completed',
    iterations,
    result: result.toFixed(2),
  });
});

// 404 handler
app.use('*', (req, res) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent('Route not found', { path: req.originalUrl });
    span.setStatus({ code: 2, message: 'Route not found' });
  }
  
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// Error handler
app.use((err, req, res, next) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(err);
    span.setStatus({ code: 2, message: err.message });
  }
  
  console.error('Error:', err);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await sdk.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await sdk.shutdown();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Express Metrics API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📈 Metrics: http://localhost:${PORT}/metrics`);
  console.log(`👥 Users API: http://localhost:${PORT}/users`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;