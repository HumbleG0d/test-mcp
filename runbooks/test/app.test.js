// tests/app.test.js
const request = require('supertest');
const app = require('../app');

describe('Express Metrics API', () => {
  
  describe('Health Check', () => {
    test('GET /health should return 200 and health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
        
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('Users API', () => {
    test('GET /users should return list of users', async () => {
      const response = await request(app)
        .get('/users')
        .expect(200);
        
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body).toHaveProperty('total');
    });

    test('GET /users/:id should return specific user', async () => {
      const response = await request(app)
        .get('/users/1')
        .expect(200);
        
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id', '1');
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('email');
    });

    test('GET /users/:id should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/users/999')
        .expect(404);
        
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'User not found');
    });

    test('POST /users should create new user', async () => {
      const newUser = {
        name: 'Test User',
        email: 'test@example.com',
        age: 25
      };

      const response = await request(app)
        .post('/users')
        .send(newUser)
        .expect(201);
        
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('name', newUser.name);
      expect(response.body.data).toHaveProperty('email', newUser.email);
      expect(response.body.data).toHaveProperty('age', newUser.age);
      expect(response.body.data).toHaveProperty('id');
    });

    test('POST /users should return 400 for missing required fields', async () => {
      const invalidUser = {
        name: 'Test User'
        // missing email and age
      };

      const response = await request(app)
        .post('/users')
        .send(invalidUser)
        .expect(400);
        
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('Missing required fields');
    });

    test('PUT /users/:id should update existing user', async () => {
      const updates = {
        name: 'Updated Name',
        age: 35
      };

      const response = await request(app)
        .put('/users/1')
        .send(updates)
        .expect(200);
        
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('name', updates.name);
      expect(response.body.data).toHaveProperty('age', updates.age);
    });

    test('DELETE /users/:id should delete user', async () => {
      // First create a user to delete
      const newUser = {
        name: 'To Delete',
        email: 'delete@example.com',
        age: 30
      };

      const createResponse = await request(app)
        .post('/users')
        .send(newUser);
      
      const userId = createResponse.body.data.id;

      const response = await request(app)
        .delete(`/users/${userId}`)
        .expect(200);
        
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'User deleted successfully');
      
      // Verify user was deleted
      await request(app)
        .get(`/users/${userId}`)
        .expect(404);
    });
  });

  describe('Metrics', () => {
    test('GET /metrics should return metrics in text format', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);
        
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('api_requests_total');
      expect(response.text).toContain('api_active_connections');
    });
  });

  describe('Error Handling', () => {
    test('GET /error should trigger test error', async () => {
      const response = await request(app)
        .get('/error')
        .expect(500);
        
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Internal server error');
    });

    test('GET /nonexistent should return 404', async () => {
      const response = await request(app)
        .get('/nonexistent')
        .expect(404);
        
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Route not found');
    });
  });

  describe('Load Test Endpoint', () => {
    test('GET /load-test should return computation result', async () => {
      const response = await request(app)
        .get('/load-test')
        .expect(200);
        
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Load test completed');
      expect(response.body).toHaveProperty('iterations');
      expect(response.body).toHaveProperty('result');
    });
  });
});