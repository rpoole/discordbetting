pragma solidity ^0.4.18;

contract DiscordBetting {

    struct Better {
        address better;
        bool win;
        uint amount;
    }

    struct Bet {
        uint id;
        uint numberOfBets;
        string information;
        bool active;
        mapping(address => Better) bets;
    }

    address public owner;
    mapping(uint => Bet) public bets;
    uint private betIdCounter;

    event BetCreated(uint betId);
    event BetEnded(uint betId, bool won);

    constructor() public {
        owner = msg.sender;
        betIdCounter = 0;
    }

    modifier onlyOwner () {
        require(msg.sender == owner);
        _;
    }

    modifier validBetId (uint betId) {
        require(betId < betIdCounter);
        Bet storage bet = bets[betId];
        require (bet.active);
        _;
    }

    function newBet(string betInformation) public onlyOwner {
        bets[betIdCounter] = Bet({id: betIdCounter, information: betInformation, active: true, numberOfBets: 0});
        emit BetCreated(betIdCounter);
        betIdCounter = betIdCounter + 1;
    }

    function takeBet(uint betId, bool win, uint amount) public validBetId(betId) {
        require(msg.sender != owner);

        bets[betId].bets[msg.sender] = Better(msg.sender, win, amount);
        bets[betId].numberOfBets = bets[betId].numberOfBets + 1;
    }

    function endBet(uint betId, bool win) public onlyOwner validBetId(betId) {
        delete bets[betId];
        emit BetEnded(betId, win);
    }
}
