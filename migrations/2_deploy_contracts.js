const DiscordBetting = artifacts.require("./DiscordBetting.sol")

module.exports = function(deployer) {
	deployer.deploy(DiscordBetting);
};
