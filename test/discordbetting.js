/*
 * Can really clean these up when
 * https://github.com/ethereum/solidity/issues/1686 is finished
 * For now, preconditions to ensure other reverts are not firing should be
 * included in the test
 */
let assertRevert = require('./helpers/assertRevert');
let DiscordBetting = artifacts.require('DiscordBetting');

contract('DiscordBetting', (accounts) => {
    let instance;
    let account0 = web3.eth.accounts[0];
    let account1 = web3.eth.accounts[1];

    beforeEach(async () => {
        instance = await DiscordBetting.new();
    });

    it('should set the owner to the deployer of the contract', async () => {
        let owner = await instance.owner.call();
        assert.equal(owner, account0);
    });

    it('should allow only the owner to create new bets', async () => {
        await assertRevert(instance.newBet('info', {from: account1}));
    });

    it('should create a new bet', async ()=> {
        let result = await instance.newBet('info');
        let id = result.logs[0].args.betId.toNumber();
        let bet = await instance.bets.call(id);
        assert.equal(bet[2], 'info');
    });

    it('should not take a bet from the owner', async ()=> {
        await assertRevert(instance.takeBet(1, true, 1));
    });

    it('should not take a bet if the bet does not exist', async ()=> {
        let result = await instance.newBet('info');
        let id = result.logs[0].args.betId.toNumber();
        await instance.takeBet(id, true, 1, {from: account1})
        await assertRevert(instance.takeBet(2, true, 1, {from: account1}));
    });

    //it('should not take a bet if the bet is not active', async () => {
        //let result = await instance.newBet('info');
        //let id = result.logs[0].args.betId.toNumber();

        //await instance.endBet(id, true);
        //assertRevert(instance.takeBet(id, true, 1, {from: account1}));
    //});

    it('should take a bet', async () => {
        let result = await instance.newBet('info');
        let id = result.logs[0].args.betId.toNumber();
        await instance.takeBet(id, true, 1, {from: account1});

        let bet = await instance.bets.call(id);
        assert.equal(bet[1].toNumber(), 1);
    });

    it('should increase the number of bets for a started bet', async () => {
        let result = await instance.newBet('info');
        let id = result.logs[0].args.betId.toNumber();
        await instance.takeBet(id, true, 1, {from: account1})
        await instance.takeBet(id, true, 1, {from: account1})

        let bet = await instance.bets.call(id);
        assert.equal(bet[1].toNumber(), 2);
    });

    it('should end a bet', async () => {
        let result = await instance.newBet('info');
        let id = result.logs[0].args.betId.toNumber();

        results = await instance.endBet(id, true);
        assert.equal(id, results.logs[0].args.betId.toNumber());
        assert.isOk(results.logs[0].args.won);

        let bet = await instance.bets.call(id);
        assert.isNotOk(bet[3]);
    });

    it('should allow only the owner to end bets', async () => {
        let result = await instance.newBet('info');
        let id = result.logs[0].args.betId.toNumber();
        await assertRevert(instance.endBet(id, true, {from: account1}));
    });
});
