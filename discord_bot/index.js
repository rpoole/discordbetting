require('dotenv').config();
const users = require('../users.json');
const request = require('request-promise');
const Discord = require('discord.js');
const client = new Discord.Client();

const baseUrl = 'http://' + process.env.BETTING_CLIENT_URL;
const baseRequest = {
	resolveWithFullResponse: true,
};

client.on('ready', async () => {
	console.info(`Logged in as ${client.user.tag}!`);
});

const bicepzbotid = '291447176536522753';
const commands = ['bet', 'bets', 'balances', 'users'];
const userNamesToIds = Object.entries(users).reduce((obj, [k, v]) => { obj[v.name.toLowerCase()] = k; return obj; }, {});

let nickNamesToId = {};
for (let [id, u] of Object.entries(users)) {
    let allNames = [u.name];
    if (u.nickNames) {
        allNames = allNames.concat(u.nickNames);
    }

    for (let nn of allNames) {
        nickNamesToId[nn.toLowerCase()] = id;
    }
}

client.on('message', async msg => {
    if (msg.author.id === bicepzbotid && msg.embeds) {
        const embed = msg.embeds[0];
        if (!embed || !embed.title.includes('Win') && !embed.title.includes('Loss')) {
            return;
        }

        const didWinHappen = embed.title.includes('Win');
        let playerNames = [];
        let content = embed.description.split('\n');

        // remove first line and last line
        content.shift();
        content.pop();

        let secondColStart = content.shift().indexOf('Hero');
        let playerIds = content.map( s => nickNamesToId[s.substring(2, secondColStart).trim().toLowerCase()] );

        await gameEnded(playerIds, didWinHappen);
        return;
    }

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
            let fields = await activeBets();
            msg.channel.send(getEmbed('Active Bets', fields));
        } else if (command === 'users') {
            let users = Object.keys(userNamesToIds);
            let fields = [{
                name: 'Users you may bet on',
                value: users.map(u => '\n-\t' + u).join(''),
            }];
            msg.channel.send(getEmbed('Users', fields));
        } else if (command === 'balances') {
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
            replyParts.push(`_${error.tip}_`);
        } else {
            console.error(error);
        }

        msg.reply(replyParts.join('\n'));
    }
});

async function gameEnded(playerIds, didWinHappen) {
    let resp = await request(Object.assign({
        method: 'POST',
        url: baseUrl + '/game_ended',
        json: {
            playerIds,
            didWinHappen,
        },
    }, baseRequest));

    console.info(`/game_ended succeeded\nStatus: ${resp.statusCode}\nBody: ${resp.body}\n`);
}

async function takeBet(betTargetUserName, amount, betOnWin, userId) {
    if (Object.keys(userNamesToIds).map( u => u.toLowerCase()).indexOf(betTargetUserName) === -1) {
        throw new BotError('Invalid bet target username', 'Try choosing a name from the !users command');
    }

    if (!(betOnWin == 'win' || betOnWin == 'lose')) {
        throw new BotError('Invalid bet outcome', 'Valid options are win or lose');
    }

    const betTargetUserId = userNamesToIds[betTargetUserName];
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

async function activeBets() {
    let resp = await request(Object.assign({
        method: 'GET',
        url: baseUrl + '/active_bets',
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
        const name = `${idx+1}. ${users[b.betTargetUserId].name}'s next dota game`;

        let bettingOnWin = [];
        let bettingOnLoss = [];
        b.bets.forEach( bet => {
            bet.betOnWin === true ? bettingOnWin.push(bet) : bettingOnLoss.push(bet);
        });

        let value = '**\tBet on win**:\n';
        for (let bet of bettingOnWin) {
            value += await formatBetStr(bet);
        };

        value += '**\tBet on loss**:\n';
        for (bet of bettingOnLoss) {
            value += await formatBetStr(bet);
        };

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
    let user = users[b.userId];
    if (!user) {
        user = await client.users.get(bet.userId);
    }

    for (let [idx, b] of balances.entries()) {
        value += `-\t ${users[b.userId].name} _${b.balance}cc_\n`
    }

    return [{
        name: 'Users that have placed bets',
        value,
    }];
}

async function formatBetStr(bet) {
    let user = users[bet.userId];
    if (!user) {
        user = await client.users.get(bet.userId);
    }
    return `\t\t- ${user.name} (_${bet.amount}cc_)\n`;
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

class BotError extends Error {
    constructor(message, tip) {
        super(message);
        this.tip = tip;
    }
}

client.login(process.env.DISCORD_TOKEN);
