pragma solidity ^0.4.23;

// TODO 
// - handle payouts
// - handle expiration of bets
contract DiscordBetting {

    struct Better {
        bool betOnWin;
        uint amount;
    }

    struct Bet {
        uint id;
        uint numberOfBets;
        string information;
        bool active;
        bool didWinHappen;
        mapping(address => Better) bets;
    }

    address public owner;
    uint private betIdCounter;
    mapping(uint => Bet) public bets;

    event BetCreated(uint betId);
    event BetEnded(uint betId, bool won);
    event Withdraw(uint betId, address recipient, uint amount);

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
        if (bets[betId].bets[msg.sender].amount == 0) {
            bets[betId].numberOfBets = bets[betId].numberOfBets + 1;
        }
        bets[betId].bets[msg.sender] = Better(betOnWin, amount);
    }

    function endBet(uint betId, bool win) public onlyOwner validBetId(betId) {
        bets[betId].active = false;
        bets[betId].didWinHappen = win;
        emit BetEnded(betId, win);
    }

    function getBetterAmountForBet(uint betId, address better) public onlyOwner constant returns (uint) {
        return bets[betId].bets[better].amount;
    }

    function withdraw(uint betId) public {
        require(bets[betId].id != 0);
        require(!bets[betId].active);

        Better storage b = bets[betId].bets[msg.sender];

        require(b.amount > 0);
        require(bets[betId].didWinHappen && b.betOnWin);

        uint payAmount = b.amount * 2;
        delete bets[betId].bets[msg.sender];
        emit Withdraw(betId, msg.sender, payAmount);
    }
}
