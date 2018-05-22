require('dotenv').config();

const Koa = require('koa');
const serverless = require('serverless-http');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const helpers = require('./helpers');
const Discord = require("discord.js");
const Database = require('./database');
const users = require('../users.json');
const moment = require('moment');

const hook = new Discord.WebhookClient(process.env.DISCORD_WEBHOOK_ID, process.env.DISCORD_WEBHOOK_TOKEN);
const app = new Koa();
const router = new Router();

let db = null;

const isServerless = process.env.SERVERLESS === 'true';
if (!isServerless) {
    const logger = require('koa-logger');
    app.use(logger());
}

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

    if (!/^\d+$/.test(params.amount.toString()) || params.amount === '0') {
        throw Error('Amount must be a positive whole number');
    }

    if (params.amount > 100) {
        throw Error('Unable to take your bet. Not enough house funds. Maximum bet is 100');
    }

    if (params.betTargetUserId === params.userId) {
        throw Error('You\'ll probably lose anyways.');
    }

    let userBalance = await db.getUserBalance(params.userId);
    if (userBalance - params.amount < -100) {
        throw Error('Your balance cannot go below -100cc');
    }

    let bet = await db.createOrGetBet(params.betTargetUserId);
    await db.takeBet(bet.betId, params.betOnWin, params.amount, params.userId);

    ctx.status = 200;
});

router.post('/cancel_bet', async (ctx) => {
    let params = ctx.requireParams('betTargetUserId', 'userId');

    let bet = await db.activeBetFor(params.betTargetUserId);
    await db.cancelBet(bet.betId, params.userId);

    ctx.status = 200;
});

router.post('/game_ended', async (ctx) => {
    let params = ctx.requireParams('playerIds', 'didWinHappen', 'duration');

    let activeBets = await db.activeBets();
    if (activeBets.length === 0) {
        ctx.body = 'No active bets';
    }

    let updates = [];
    let cancels = [];
    let endedBets = [];

    let duration = params.duration.split(':').reverse().map(d => parseInt(d));
    let gameStarted = moment().subtract(duration[0], 'seconds').subtract(duration[1], 'minutes');
    if (duration.length === 3) {
        gameStarted = gameStarted.subtract(duration[2], 'hours');
    }

    for (let ab of activeBets) {
        if (!params.playerIds.includes(ab.betTargetUserId)) {
            continue;
        }

        for (let [idx, b] of Object.entries(ab.bets)) {
            const betPlaced = moment(parseInt(b.betPlaced));
            if (betPlaced.isAfter(gameStarted) || params.playerIds.includes(b.userId)) {
                cancels.push(db.cancelBet(ab.betId, b.userId));
                b.canceled = true;
            }
        }

        endedBets.push(ab);
        updates.push(db.endBet(ab, params.didWinHappen));
    }

    await Promise.all(cancels);
    await Promise.all(updates);


    for (let eb of endedBets) {
        const betTargetUserName = users[eb.betTargetUserId].name;
        const result = params.didWinHappen ? 'won' : 'lost';

        let canceledStr = '\n**Canceled**:\n';
        let winnersStr = '\n**Winners**:\n';
        let losersStr = '\n**Losers**:\n';
        let hasWin = false;
        let hasLoss = false;
        let hasCanceled = false;
        for (let b of Object.values(eb.bets)) {
            const name = users[b.userId].name;
            const str = `\t${name} (${b.amount}cc)\n`;

            if (b.canceled) {
                canceledStr += str;
                hasCanceled = true;
                continue;
            } else if (b.betOnWin === params.didWinHappen) {
                winnersStr += str;
                hasWin = true;
            } else {
                losersStr += str;
                hasLoss = true;
            }
        }

        if (!hasWin) {
            winnersStr += '\tNone\n';
        }

        if (!hasLoss) {
            losersStr += '\tNone\n';
        }

        if (!hasCanceled) {
            canceledStr += '\tNone\n';
        }

        let emoji = users[eb.betTargetUserId].emoji;
        if (!emoji && !params.didWinHappen) {
            emoji = {
                id: '284060220647538688',
                name: 'FeelsBadMan',
            };
        } else if (!emoji) {
            emoji = {
                id: '283668862677942273',
                name: 'FeelsGoodMan',
            };
        }

        emoji = `<:${emoji.name}:${emoji.id}>`;

        hook.sendSlackMessage({
            attachments: [{
                pretext: `***Bet finished!***\n${betTargetUserName} ${result} his game! ${emoji}\n` + winnersStr + losersStr + canceledStr + '\n\n',
                color: '#69553d',
                footer_icon: 'https://www.cryptocompare.com/media/20275/etc2.png',
                footer: `You may now bet on ${betTargetUserName}'s next game.`,
            }],
        });
    }

    ctx.body = `${endedBets.length} bets ended`;
});

router.get('/balances', async (ctx) => {
    ctx.body = await db.getBalances();
});

router.get('/active_bets', async (ctx) => {
    ctx.body = await db.activeBets(parseInt(ctx.query.days_back));
});

app.use(router.routes());
app.use(router.allowedMethods());

if (!isServerless) {
    app.listen(3001);
} else {
    module.exports.handler = serverless(app);
}
