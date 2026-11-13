const request = require('supertest');
const app = require('../../src/app');

describe('Health and System Routes', () => {
  it('GET /health should return 200 with system status and database info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
    expect(res.body).toHaveProperty('system', 'Resilient Decision System Engine');
    expect(res.body).toHaveProperty('uptimeSeconds');
    expect(res.body).toHaveProperty('database');
    expect(res.body.database).toHaveProperty('connected');
    expect(res.body.database).toHaveProperty('state');
  });

  it('GET /api/health should alias /health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
  });

  it('GET /non-existent-route should return structured 404 error', async () => {
    const res = await request(app).get('/non-existent-route');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(res.body.error).toHaveProperty('message');
  });
});

