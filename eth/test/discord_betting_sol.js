/*
 * Can really clean these up when
 * https://github.com/ethereum/solidity/issues/1686 is finished
 * For now, preconditions to ensure other reverts are not firing should be
 * included in the test
 */
let assertRevert = require('./helpers/assert_revert');
let structs = require('./helpers/structs');
let DiscordBetting = artifacts.require('DiscordBetting');

contract('DiscordBetting', (accounts) => {
    let instance;
    let account0 = web3.eth.accounts[0];
    let account1 = web3.eth.accounts[1];

    beforeEach(async () => {
        instance = await DiscordBetting.new();
    });

    describe('constructor', async () => {
        it('should set the owner to the deployer of the contract', async () => {
            let owner = await instance.owner.call();
            assert.equal(owner, account0);
        });
    });

    describe('newBet', async () => {
        it('should allow only the owner to create new bets', async () => {
            await assertRevert(instance.newBet('info', {from: account1}));
        });

        it('should create a new bet', async ()=> {
            let result = await instance.newBet('info');
            let id = result.logs[0].args.betId.toNumber();
            let bet = structs.Bet(await instance.bets.call(id));
            assert.equal(bet.information, 'info');
        });
    });

    describe('takeBet', async () => {
        let result;
        let id;

        beforeEach(async ()=> {
            result = await instance.newBet('info');
            id = result.logs[0].args.betId.toNumber();
        });

        it('should not take a bet if the bet is not active', async () => {
            await instance.endBet(id, true);
            assertRevert(instance.takeBet(id, true, 1));
        });

        describe('with a working bet', async () => {
            let bet;

            beforeEach(async () => {
                await instance.takeBet(id, true, 1)
                bet = structs.Bet(await instance.bets.call(id));
            });

            it('should not take a bet if the bet does not exist', async () => {
                await assertRevert(instance.takeBet(2, true, 1));
            });

            it('should take a bet', async () => {
                assert.equal(bet.numberOfBetters, 1);
            });

            it('should increase the balance when a bet is taken', async () => {
                let balance = (await instance.balance.call()).toNumber();
                assert.equal(1, balance);
            });

            it('should override the current bet, but not increase total bets', async () => {
                assert.equal(bet.numberOfBetters, 1);

                let betterAmount = (await instance.getBetterAmountForBet(id, account0)).toNumber();
                assert.equal(1, betterAmount);

                await instance.takeBet(id, true, 2);

                bet = structs.Bet(await instance.bets.call(id));
                assert.equal(bet.numberOfBetters, 1);

                betterAmount = (await instance.getBetterAmountForBet(id, account0)).toNumber();
                assert.equal(2, betterAmount);
            });

            it('should increase the number of bets for a started bet', async () => {
                await instance.takeBet(id, true, 1, {from: account1})

                bet = structs.Bet(await instance.bets.call(id));
                assert.equal(bet.numberOfBetters, 2);
            });
        });

    });

    describe('endBet', async () => {
        it('should end a bet', async () => {
            let result = await instance.newBet('info');
            let id = result.logs[0].args.betId.toNumber();

            results = await instance.endBet(id, true);
            assert.equal(id, results.logs[0].args.betId.toNumber());
            assert.isOk(results.logs[0].args.won);

            let bet = structs.Bet(await instance.bets.call(id));
            assert.isOk(bet.didWinHappen);
            assert.isNotOk(bet.active);
        });

        it('should allow only the owner to end bets', async () => {
            let result = await instance.newBet('info');
            let id = result.logs[0].args.betId.toNumber();
            await assertRevert(instance.endBet(id, true, {from: account1}));
        });
    });

    describe('withdraw', async () => {
        let betId;
        const betAmount = 5;

        beforeEach(async () => {
            let result = await instance.newBet('info');
            betId = result.logs[0].args.betId.toNumber();
            await instance.takeBet(betId, true, betAmount);
        });

        it('should not allow a withdraw if there is no bet', async () => {
            await assertRevert(instance.withdraw(0xdeadbeef));
        });

        it('should not allow a withdraw if the bet is active', async () => {
            await assertRevert(instance.withdraw(betId));
        });

        it('should not allow a withdraw if there is nothing to withdraw', async () => {
            await instance.endBet(betId, true);
            let result = await instance.withdraw(betId);
            let amount = result.logs[0].args.amount.toNumber();
            assert.equal(amount, betAmount*2);

            await assertRevert(instance.withdraw(betId));
        });

        it('should withdraw nothing if the sender did not win', async () => {
            await instance.takeBet(betId, false, betAmount);
            await instance.endBet(betId, true);
            await assertRevert(instance.withdraw(betId));
        });

        it('should withdraw if game was lost and bet was on a loss');

        it('should withdraw winnings', async () => {
            await instance.endBet(betId, true);
            let result = await instance.withdraw(betId);
            let amount = result.logs[0].args.amount.toNumber();
            assert.equal(amount, betAmount*2);
        });

        it('should decrease the balance', async () => {
            const betAmount2 = 1000;
            await instance.takeBet(betId, false, betAmount2, {from: account1});
            await instance.endBet(betId, true);
            await instance.withdraw(betId);
            const balance = (await instance.balance.call()).toNumber();
            assert.equal(betAmount2 - betAmount, balance);
        });
    });
});
