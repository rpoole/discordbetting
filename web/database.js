const AWS = require('aws-sdk');
const DiscordBettingContract = require('./db_contract');
const moment = require('moment');

const DB_TABLE = process.env.DB_TABLE;
const USERS_TABLE = process.env.USERS_TABLE;

AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: new AWS.Endpoint(process.env.AWS_ENDPOINT),
});

let dynamoDb = new AWS.DynamoDB.DocumentClient();

class Database {
    async init() {
        this.dbContract = await new DiscordBettingContract().getInstance();
    }

    async activeBets(numberOfDaysBack=null) {
        const params = {
            TableName: DB_TABLE,
            IndexName: 'ActiveBetsIndex',
            KeyConditionExpression: 'active = :active',
            ExpressionAttributeValues: { 
                ':active': 'true',
            },
        };

        const items = (await dynamoDb.query(params).promise()).Items;

        if (!numberOfDaysBack) {
            return items;
        }

        return items.filter( i => {
            for (let b of i.bets) {
                if (moment().diff(moment(parseInt(b.betPlaced)), 'days') <= numberOfDaysBack) {
                    return true;
                }
            }
        });
    }

    async takeBet(betId, betOnWin, amount, userId) {
        await this.dbContract.takeBet(betId, betOnWin, amount);

        const dbParams = {
            TableName: DB_TABLE,
            Key: {
                betId: betId,
            },
            UpdateExpression: 'set bets = list_append(bets, :better), betterIds = list_append(betterIds, :betterIdList)',
            ConditionExpression: 'not contains (betterIds, :betterId)',
            ExpressionAttributeValues: {
                ':betterIdList': [userId],
                ':betterId': userId,
                ':better': [{
                    userId: userId,
                    amount: amount,
                    betOnWin: betOnWin,
                    betPlaced: moment().valueOf(),
                }],
            }
        };

        await dynamoDb.update(dbParams).promise();

        const userParams = {
            TableName: USERS_TABLE,
            Key: {
                userId: userId,
            },
            UpdateExpression: 'ADD balance :balance',
            ExpressionAttributeValues: {
                ':balance': -amount,
            },
        };

        await dynamoDb.update(userParams).promise();
    }

    async createOrGetBet(betTargetUserId) {
        let activeBets = await this.activeBetFor(betTargetUserId);

        if (activeBets.length === 1) {
            return activeBets[0];
        }

        const betInfo = `${betTargetUserId}'s next game`;
        const betId = await this.dbContract.newBet(betInfo);

        const Item = {
            betId: betId,
            active: 'true',
            betInfo: betInfo,
            betTargetUserId: betTargetUserId,
            bets: [],
            betterIds: [],
        };

        const params = {
            TableName: DB_TABLE,
            Item,
        };

        await dynamoDb.put(params).promise();
        return Item;
    }

    async activeBetFor(betTargetUserId) {
        const params = {
            TableName: DB_TABLE,
            IndexName: 'ActiveBetsIndex',
            KeyConditionExpression: 'betTargetUserId = :betTargetUserId and active = :active',
            ExpressionAttributeValues: { 
                ':active': 'true',
                ':betTargetUserId': betTargetUserId,
            } ,
        };

        return (await dynamoDb.query(params).promise()).Items;
    }

    async endBet(bet, didWinHappen) {
        await this.dbContract.endBet(bet.betId, didWinHappen);

        const params = {
            TableName: DB_TABLE,
            Key: {
                betId: bet.betId,
            },
            UpdateExpression: 'set active = :active',
            ExpressionAttributeValues: {
                ':active': 'false'
            },
        };

        await dynamoDb.update(params).promise();

        let userUpdates = [];
        for (let better of bet.bets) {
            if (better.betOnWin === didWinHappen) {
                const params = {
                    TableName: USERS_TABLE,
                    Key: {
                        userId: better.userId,
                    },
                    UpdateExpression: 'ADD balance :balance',
                    ExpressionAttributeValues: {
                        ':balance': 2*better.amount,
                    },
                };

                userUpdates.push(dynamoDb.update(params).promise());
            }
        }

        await Promise.all(userUpdates);
    }

    async getBalances() {
        const params = {
            TableName: USERS_TABLE,
            ScanIndexForward: false,
        };

        return (await dynamoDb.scan(params).promise()).Items.sort((a, b) => {
            if (a.balance < b.balance) {
                return 1;
            }

            if (a.balance > b.balance) {
                return -1;
            }

            return 0;
        });
    }

    async getUserBalance(userId) {
        const params = {
            TableName: USERS_TABLE,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: { 
                ':userId': userId,
            } ,
        };

        let balances = (await dynamoDb.query(params).promise()).Items;

        if (balances.length === 0) {
            return 0;
        }

        return balances[0].balance;
    }
}


module.exports = Database;
