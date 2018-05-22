pragma solidity ^0.4.23;

contract DiscordBetting {

    struct Better {
        bool betOnWin;
        uint amount;
    }

    struct Bet {
        uint id;
        uint numberOfBetters;
        string information;
        bool active;
        bool didWinHappen;
        mapping(address => Better) bets;
    }

    address public owner;
    uint private betIdCounter;
    mapping(uint => Bet) public bets;
    uint public balance;

    event BetCreated(uint betId);
    event BetEnded(uint betId, bool won);
    event Withdraw(uint betId, address recipient, uint amount);
    event BetTaken(uint betId, address better);
    event BetCanceled(uint betId, address better);

    constructor() public {
        owner = msg.sender;
        betIdCounter = 1;
    }

    modifier onlyOwner () {
        require(msg.sender == owner);
        _;
    }

    modifier validBetId (uint betId) {
        require(betId < betIdCounter);
        require (bets[betId].active);
        _;
    }

    function newBet(string betInformation) public onlyOwner {
        bets[betIdCounter] = Bet(betIdCounter, 0, betInformation, true, false);
        emit BetCreated(betIdCounter);
        betIdCounter = betIdCounter + 1;
    }

    function takeBet(uint betId, bool betOnWin, uint amount) public validBetId(betId) {
        require(amount > 0);

        if (bets[betId].bets[msg.sender].amount == 0) {
            bets[betId].numberOfBetters = bets[betId].numberOfBetters + 1;
        }
        bets[betId].bets[msg.sender] = Better(betOnWin, amount);
        balance += amount;
        emit BetTaken(betId, msg.sender);
    }

    function endBet(uint betId, bool didWinHappen) public onlyOwner validBetId(betId) {
        bets[betId].active = false;
        bets[betId].didWinHappen = didWinHappen;
        emit BetEnded(betId, didWinHappen);
    }

    function getBetterAmountForBet(uint betId, address better) public onlyOwner constant returns (uint) {
        return bets[betId].bets[better].amount;
    }

    function cancelBet(uint betId) public validBetId(betId) {
        Better storage b = bets[betId].bets[msg.sender];

        require(b.amount > 0);

        balance = balance - b.amount;
        delete bets[betId].bets[msg.sender];
        emit BetCanceled(betId, msg.sender);
    }

    function withdraw(uint betId) public {
        require(bets[betId].id != 0);
        require(!bets[betId].active);

        Better storage better = bets[betId].bets[msg.sender];

        require(better.amount > 0);
        require(bets[betId].didWinHappen == better.betOnWin);

        uint payAmount = better.amount * 2;
        balance = balance - payAmount;
        delete bets[betId].bets[msg.sender];
        emit Withdraw(betId, msg.sender, payAmount);

        Bet storage bet = bets[betId];
        bet.numberOfBetters = bet.numberOfBetters - 1;
        if (bet.numberOfBetters == 0) {
            delete bets[betId];
        }
    }
}
