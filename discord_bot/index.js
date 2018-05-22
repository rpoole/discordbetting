require('dotenv').config();
const bettableUsers = require('../users.json');
const request = require('request-promise');
const Discord = require('discord.js');
const client = new Discord.Client({
    messageCacheMaxSize: 20,
    messageCacheLifetime: 30,
    messageSweepInterval: 35,
});

const baseUrl = 'http://' + process.env.BETTING_CLIENT_URL;
const baseRequest = {
	resolveWithFullResponse: true,
};

let namesToId = {};
for (let [id, u] of Object.entries(bettableUsers)) {
    let allNames = [u.name];
    if (u.nickNames) {
        allNames = allNames.concat(u.nickNames);
    }

    for (let nn of allNames) {
        namesToId[nn.toLowerCase()] = id;
    }
}

client.on('ready', async () => {
	console.info(`Logged in as ${client.user.tag}!`);
});

client.on('message', async msg => {
    if (msg.channel.guild.id !== process.env.DISCORD_SERVER_ID || msg.channel.id !== process.env.DISCORD_SERVER_CHANNEL_ID) {
        return;
    }

    if (msg.author.id === process.env.BICEPZ_BOT_ID && msg.embeds.length > 0) {
        const embed = msg.embeds[0];
        if (!embed || !embed.title.includes('Win') && !embed.title.includes('Loss')) {
            return;
        }

        const duration = embed.title.split('-')[2].trim();

        const didWinHappen = embed.title.includes('Win');
        let playerNames = [];
        let content = embed.description.split('\n');

        // remove first line and last line
        content.shift();
        content.pop();

        let secondColStart = content.shift().indexOf('Hero');
        let playerIds = content.map( s => namesToId[s.substring(2, secondColStart).trim().toLowerCase()] );

        await gameEnded(playerIds, didWinHappen, duration);
        return;
    }

    if (msg.content[0] !== '!') {
        return;
    }

    const commands = ['bet', 'bets', 'balances', 'users'];
	let command = msg.content.split(' ')[0].substring(1);
	if (!commands.includes(command)) {
		return;
	}

	let args = msg.content.split(' ');
	args.shift();
    args = args.map( a => a.toLowerCase() );

    try {
        if (command === 'bet') {
            if (args.length != 3) {
                msg.reply('You must provide 3 options.\n\t1. Person who\'s game you will be bet on\n\t2. Bet amount\n\t3. If they will win\nExample: _!bet Zack 10 win_');
                return;
            }

            args.push(msg.author.id);
            await takeBet(...args);
            let fields = await activeBets();
            msg.reply('Your bet was taken.');
        } else if (command === 'bets') {
            if (args.length > 1) {
                msg.reply('Too many arguments');
                return;
            }

            let fields = await activeBets(...args);
            msg.channel.send(getEmbed('Active Bets', fields));
        } else if (command === 'users') {
            if (args.length !== 0) {
                msg.reply('Too many arguments');
                return;
            }
            let users = Object.keys(namesToId);
            let fields = [{
                name: 'Users you may bet on',
                value: users.map(u => '\n-\t' + u).join(''),
            }];
            msg.channel.send(getEmbed('Users', fields));
        } else if (command === 'balances') {
            if (args.length !== 0) {
                msg.reply('Too many arguments');
                return;
            }
            let fields = await getBalances();
            msg.channel.send(getEmbed('Balances', fields));
        }
    } catch (error) {
        let replyParts = [`Unable to execute ${command}`];
        if (error.response) {
            console.error(`${error.response.request.uri.path} failed\nStatus: ${error.response.statusCode}\nBody: ${error.response.body}\n`);
            replyParts.push(`Reason: ${error.response.body}`);
        } else if (error instanceof BotError) {
            replyParts.push(`Reason: ${error.message}`);
            if (error.tip) {
                replyParts.push(`_${error.tip}_`);
            }
        } else {
            console.error(error);
        }

        msg.reply(replyParts.join('\n'));
    }
});

async function gameEnded(playerIds, didWinHappen, duration) {
    let resp = await request(Object.assign({
        method: 'POST',
        url: baseUrl + '/game_ended',
        json: {
            playerIds,
            didWinHappen,
            duration,
        },
    }, baseRequest));

    console.info(`/game_ended succeeded\nStatus: ${resp.statusCode}\nBody: ${resp.body}\n`);
}

async function takeBet() {
    const userId = arguments[3];
    let betTargetUserName = null;
    let amount = null;
    let betOnWin = null;

    for (let i = 0; i < arguments.length-1; i++) {
        let arg = arguments[i];
        if (arg === 'win' || arg === 'lose') {
            betOnWin = arg;
            continue;
        }

        if (/\d+/.test(arg)) {
            amount = arg;
            continue;
        }

        if (/\w+/.test(arg)) {
            betTargetUserName = arg;
        }
    }

    if (betOnWin === null) {
        throw new BotError('Win/lose not provided');
    }

    if (amount === null) {
        throw new BotError('Amount not provided');
    }

    if (betTargetUserName === null) {
        throw new BotError('User not provided');
    }

    if (Object.keys(namesToId).map( u => u.toLowerCase()).indexOf(betTargetUserName) === -1) {
        throw new BotError('Invalid bet target username', 'Try choosing a name from the !users command');
    }

    const betTargetUserId = namesToId[betTargetUserName];
    betOnWin = betOnWin === 'win' ? true : false;

    let resp = await request(Object.assign({
        method: 'POST',
        url: baseUrl + '/take_bet',
        json: {
            betTargetUserId,
            userId,
            betOnWin,
            amount,
        },
    }, baseRequest));

    console.info(`/take_bet succeeded\nStatus: ${resp.statusCode}\nBody: ${resp.body}\n`);
}

async function activeBets(allBets) {
    let url = '/active_bets';

    if (allBets !== undefined && allBets !== 'all') {
        throw new BotError('Invalid option', 'Provide only no argument or \'all\'');
    } else if (allBets === undefined) {
        url += '?days_back=3';
    }

    let resp = await request(Object.assign({
        method: 'GET',
        url: baseUrl + url,
    }, baseRequest));
    console.info(`/active_bets succeeded\nStatus: ${resp.statusCode}\nBody: ${resp.body}\n`);

    let items = JSON.parse(resp.body);

    if (items.length === 0) {
        return [{
            name: 'No active bets',
            value: ':(',
        }];
    }

    let fields = [];
    for (let [idx, b] of items.entries()) {
        let username = (await getUser(b.betTargetUserId)).name;
        const name = `${idx+1}. ${username}'s next dota game`;

        let bettingOnWin = [];
        let bettingOnLoss = [];
        Object.values(b.bets).forEach( bet => {
            bet.betOnWin === true ? bettingOnWin.push(bet) : bettingOnLoss.push(bet);
        });

        let value = '';
        if (bettingOnWin.length > 0) {
            value = '**\tBet on win**:\n';
            for (let bet of bettingOnWin) {
                value += await formatBetStr(bet);
            };
        }

        if (bettingOnLoss.length > 0) {
            value += '**\tBet on loss**:\n';
            for (bet of bettingOnLoss) {
                value += await formatBetStr(bet);
            };
        }


        fields.push({
            name,
            value,
        });
    };

    return fields;
}

async function getBalances() {
    let resp = await request(Object.assign({
        method: 'GET',
        url: baseUrl + '/balances',
    }, baseRequest));
    console.info(`/balances succeeded\nStatus: ${resp.statusCode}\nBody: ${resp.body}\n`);

    let balances = JSON.parse(resp.body);
    let value = '';
    for (let b of balances) {
        let user = await getUser(b.userId);
        value += `-\t ${user.name} _${b.balance}cc_\n`
    }

    return [{
        name: 'Users that have placed bets',
        value,
    }];
}

async function formatBetStr(bet) {
    let name = (await getUser(bet.userId)).name;
    return `\t\t- ${name} (_${bet.amount}cc_)\n`;
};

function getEmbed(name, fields) {
    return {embed: {
        color: 6903101,
        author: {
            name,
            icon_url: 'https://www.cryptocompare.com/media/20275/etc2.png',
        },
        fields,
    }}
}

async function getUser(userId) {
    if (bettableUsers[userId]) {
        return bettableUsers[userId];
    }

    user = await client.users.get(userId);

    return {
        name: user.username,
        nickNames: [],
    };
}

class BotError extends Error {
    constructor(message, tip) {
        super(message);
        this.tip = tip;
    }
}

client.login(process.env.DISCORD_TOKEN);
