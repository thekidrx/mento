const request = require('supertest');
const { createApp } = require('../app');
const { createDb } = require('../db');

describe('health check', () => {
  it('responds ok on GET /api/health', async () => {
    const db = createDb(':memory:');
    const app = createApp(db);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
