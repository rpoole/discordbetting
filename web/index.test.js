const app = require('./index').app;
const request = require('supertest');

test('should take a bet', async () => {
    const response = await request(app.callback()).post('/take_bet');

    expect(response).toBeDefined();
    expect(response.status).toEqual(200);
});
