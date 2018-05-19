require('dotenv').config();

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

    try {
        await db.takeBet(bet.betId, params.betOnWin, params.amount, params.userId);
    } catch (err) {
        if (err.message && err.message === 'The conditional request failed') {
            throw Error('You may not be twice');
        }

        throw err;
    }

    ctx.status = 200;
});

router.post('/game_ended', async (ctx) => {
    let params = ctx.requireParams('playerIds', 'didWinHappen');

    let activeBets = await db.activeBets();
    if (activeBets.length === 0) {
        ctx.body = 'No active bets';
    }

    let updates = [];
    let endedBets = [];
    for (ab of activeBets) {
        if (!params.playerIds.includes(ab.betTargetUserId)) {
            continue;
        }

        endedBets.push(ab);
        updates.push(db.endBet(ab, params.didWinHappen));
    }

    await Promise.all(updates);

    for (eb of endedBets) {
        if (!params.playerIds.includes(eb.betTargetUserId)) {
            continue;
        }

        const betTargetUserName = users[eb.betTargetUserId].name;
        const result = params.didWinHappen ? 'won' : 'lost';

        let winnersStr = '\n**Winners**:\n';
        let losersStr = '\n**Losers**:\n';
        let hasBetOnWin = false;
        let hasBetOnLose = false;
        for (b of eb.bets) {
            const name = users[b.userId].name;
            const str = `\t${name} (${b.amount}cc)\n`;
            b.betOnWin === params.didWinHappen ? winnersStr += str : losersStr += str;
            if (b.betOnWin) {
                hasBetOnWin = true;
            } else {
                hasBetOnLose = true;
            }
        }

        if (!hasBetOnWin) {
            winnersStr += '\tNone\n';
        }

        if (!hasBetOnLose) {
            losersStr += '\tNone\n';
        }

        let emoji = users[eb.betTargetUserId].emoji;
        if (!emoji && !params.didWinHappen) {
            emoji = {
                id: '284060220647538688',
                name: 'FeelsBadMan',
            };
        } else {
            emoji = {
                id: '283668862677942273',
                name: 'FeelsGoodMan',
            };
        }

        emoji = `<:${emoji.name}:${emoji.id}>`;

        hook.sendSlackMessage({
            attachments: [{
                pretext: `***Bet finished!***\n${betTargetUserName} ${result} his game! ${emoji}\n` + winnersStr + losersStr + '\n\n',
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
    ctx.body = await db.activeBets();
});

app.use(router.routes());
app.use(router.allowedMethods());

if (!isServerless) {
    app.listen(3001);
} else {
    module.exports.handler = serverless(app);
}
