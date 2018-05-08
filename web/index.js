const Koa = require('koa');
const serverless = require('serverless-http');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const DiscordBetting = require('./discord_betting');
const AWS = require('aws-sdk');
const helpers = require('./helpers');

const app = new Koa();
const router = new Router();

const DB_TABLE = process.env.DB_TABLE;

AWS.config.update({
  region: 'us-east-1',
  accessKeyId: 'accessKeyId',
  secretAccessKey: 'secretAccessKey',
  endpoint: new AWS.Endpoint('http://localhost:8000'),
});

app.use(async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        ctx.status = err.status || 500;
        ctx.body = err.message;
        ctx.app.emit('error', err, ctx);
    }
});

app.use(bodyParser());

app.use( async (ctx, next) => {
    ctx.dbContract = await new DiscordBetting().getInstance();
    ctx.requireParams = helpers.requireParams.bind(ctx);
    await next();
});

app.use( async (ctx, next) => {
    ctx.dynamoDb = new AWS.DynamoDB.DocumentClient({
        region: 'localhost',
        endpoint: 'http://localhost:8000'
    });
    await next();
});

router.post('/take_bet', async (ctx) => {
    let params = ctx.requireParams('betId', 'userId', 'amount', 'betOnWin');

    await ctx.dbContract.takeBet(params.betId, params.betOnWin, params.amount);

    const dParams = {
        TableName: DB_TABLE,
        Key: {
            betId: params.betId,
        },
        UpdateExpression: 'set bets = list_append(bets, :better), betterIds = list_append(betterIds, :betterIdList)',
        ConditionExpression: 'not contains (betterIds, :betterId)',
        ExpressionAttributeValues: {
            ':betterIdList': [params.userId],
            ':betterId': params.userId,
            ':better': [{
                id: params.userId,
                amount: params.amount,
                betOnWin: params.betOnWin,
            }],
        }
    };

    await ctx.dynamoDb.update(dParams).promise();
    ctx.status = 201;
    ctx.body = 'bet taken';
});

router.put('/new_bet', async (ctx) => {
    let params = ctx.requireParams('betInfo', 'userId');
    let betId = await ctx.dbContract.newBet(params.betInfo);

    const dParams = {
        TableName: DB_TABLE,
        Item: {
            betId: betId.toString(),
            active: 'true',
            betInfo: params.betInfo,
            userId: params.userId,
            bets: [],
            betterIds: [],
        },
    };

    await ctx.dynamoDb.put(dParams).promise();
    ctx.status = 200;
});

router.post('/end_bet', async (ctx) => {
    let params = ctx.requireParams('betId', 'userId', 'didWinHappen');

    await ctx.dbContract.endBet(params.betId, params.didWinHappen);

    const dParams = {
        TableName: DB_TABLE,
        Key: {
            betId: params.betId,
        },
        UpdateExpression: 'set active = :active',
        ConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
            ':userId': params.userId,
            ':active': 'false'
        }
    };

    await ctx.dynamoDb.update(dParams).promise();
    ctx.status = 200;
});

router.get('/active_bets', async (ctx) => {
    const params = {
        TableName: DB_TABLE,
        IndexName: 'ActiveBetsIndex',
        KeyConditionExpression: 'active = :active',
        ExpressionAttributeValues: { 
            ':active': 'true',
        } ,
    };

    let result = await ctx.dynamoDb.query(params).promise();
    ctx.body = result;
});

app.use(router.routes());
app.use(router.allowedMethods());

module.exports.handler = serverless(app);
module.exports.app = app;
