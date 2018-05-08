require('dotenv').config();

const request = require('request-promise');
const Discord = require('discord.js');
const client = new Discord.Client();

let commands = ['bet', 'bets'];

const baseUrl = 'http://' + process.env.BETTING_CLIENT_URL;
const baseRequest = {
    resolveWithFullResponse: true,
};

client.on('ready', async () => {
    console.info(`Logged in as ${client.user.tag}!`);

});

client.on('message', async msg => {
    let command = msg.content.split(' ')[0].substring(1);
    if (!commands.includes(command)) {
        return;
    }

    let args = msg.content.split(' ');
    args.shift();

    if (command === 'bet') {
        if (args.length != 3) {
            msg.reply('You must provide 3 options (betId, amount, betOnWin).\nExample: !bet 1 10 true');
            return;
        }

        args.push(msg.author.id);
        try {
            await bet(...args);
            msg.reply('Your bet was taken.');
        } catch (error) {
            msg.reply('Unable to take your bet.');
        }
    } else if (command === 'bets') {
        try {
            let replyString = await bets();
            msg.channel.send(replyString);
        } catch (error) {
            msg.reply('Unable to get active bets.');
        }
    }
});

async function bet(betId, amount, betOnWin, userId) {
    try {
        let resp = await request(Object.assign(baseRequest, {
            method: 'POST',
            url: baseUrl + '/take_bet',
            json: {
                betId: betId,
                userId: userId,
                betOnWin: betOnWin,
                amount: amount,
            },
        }));

        console.info(`/take_bet succeeded\nStatus: ${resp.statusCode}\nBody: ${resp.body}\n`);
    } catch (error) {
        console.error(`/take_bet failed\nStatus: ${error.response.statusCode}\nBody: ${error.response.body}\n`);
        throw error;
    };

}

async function bets() {
    try {
        let resp = await request(Object.assign(baseRequest, {
            method: 'GET',
            url: baseUrl + '/active_bets',
        }));

        let bets = JSON.parse(resp.body).Items.map( b => `\`\`\`ID: ${b.betId}\nInfo: ${b.betInfo}\`\`\`` ).join('\n');

        return `Active bets are\n${bets}`;

        console.info(`/active_bets succeeded\nStatus: ${resp.statusCode}\nBody: ${resp.body}\n`);
    } catch (error) {
        console.error(`/active_bets failed\nStatus: ${error.response.statusCode}\nBody: ${error.response.body}\n`);
        throw error;
    };
}

client.login(process.env.DISCORD_TOKEN);
