require('dotenv').config({path: '../.env'});
const Koa = require('koa');
const serverless = require('serverless-http');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const helpers = require('./helpers');
const Discord = require("discord.js");
const Database = require('./database');
const users = require('../users.json');

const hook = new Discord.WebhookClient(process.env.DISCORD_WEBHOOK_ID, process.env.DISCORD_WEBHOOK_TOKEN);
const app = new Koa();
const router = new Router();

let db = null;
const houseCoins = 10000000;

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
    if (!db) {
        db = new Database();
        await db.init();
    }

    ctx.requireParams = helpers.requireParams.bind(ctx);

    await next();
});

router.post('/take_bet', async (ctx) => {
    let params = ctx.requireParams('betTargetUserId', 'userId', 'amount', 'betOnWin');

    if (!/^\d+$/.test(params.amount.toString())) {
        throw Error('Amount must be a positive whole number');
    }

    if (params.amount * 4 > houseCoins) {
        throw Error(`Unable to take your bet. Not enough house funds. Maximum bet is ${houseCoins/4}`);
    }

    let userBalance = await db.getUserBalance(params.userId);
    if (userBalance - params.amount < -100) {
        throw Error('Your balance cannot go below -100cc');
    }

    let bet = await db.createOrGetBet(params.betTargetUserId);

    await db.takeBet(bet.betId, params.betOnWin, params.amount, params.userId);

    ctx.status = 200;
});

router.post('/end_bet', async (ctx) => {
    let params = ctx.requireParams('betTargetUserId', 'didWinHappen');

    let bet = await db.endBet(params.betTargetUserId, params.didWinHappen, params.userId);

    const betTargetUserName = users[params.betTargetUserId].name;
    const result = params.didWinHappen === 'true'? 'won' : 'lost';

    let winnersStr = '\n**Winners**:\n';
    let losersStr = '\n**Losers**:\n';
    for (b of bet.bets) {
        const name = users[b.userId].name;
        const str = `\t${name} (${b.amount}cc)`;
        b.betOnWin === params.didWinHappen ? winnersStr += str : losersStr += str;
    }

    hook.sendSlackMessage({
        attachments: [{
            pretext: `***Bet finished!***\n${betTargetUserName} ${result} his game! \:bowling:\n` + winnersStr + losersStr + '\n',
            color: '#69553d',
            footer_icon: 'https://www.cryptocompare.com/media/20275/etc2.png',
            footer: `You may now bet on ${betTargetUserName}'s next game.`,
        }],
    });

    ctx.status = 200;
});

router.get('/balances', async (ctx) => {
    ctx.body = await db.getBalances();
});

router.get('/active_bets', async (ctx) => {
    ctx.body = await db.activeBets();
});

app.use(router.routes());
app.use(router.allowedMethods());

module.exports.handler = serverless(app);
module.exports.app = app;
