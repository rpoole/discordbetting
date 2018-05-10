const Web3 = require('web3');
const contract = require("truffle-contract");
const DiscordBettingContractJSON = require('../eth/build/contracts/DiscordBetting.json');

class DiscordBetting {
    async getInstance() {
        let provider = new Web3.providers.HttpProvider("http://localhost:8545");
        this.web3 = new Web3(provider);

        let DBContract = contract(DiscordBettingContractJSON);
        DBContract.setProvider(provider);
        this.instance = await DBContract.deployed();

        return this;
    }

    async newBet(info) {
        let result = await this.instance.newBet(info, {from: this.web3.eth.accounts[0], gas:4712388});
        let id = result.logs[0].args.betId.toNumber();
        return id;
    }

    async takeBet(betId, betOnWin, amount) {
        await this.instance.takeBet(betId, betOnWin, amount, {from: this.web3.eth.accounts[0], gas:4712388});
    }

    async endBet(betId, didWinHappen) {
        await this.instance.endBet(betId, didWinHappen, {from: this.web3.eth.accounts[0], gas:4712388});
    }
}

module.exports = DiscordBetting;
