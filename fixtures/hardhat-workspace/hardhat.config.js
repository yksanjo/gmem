require("@nomicfoundation/hardhat-toolbox");
module.exports = {
  solidity: "0.8.20",
  networks: {
    base:     { url: "https://mainnet.base.org",   chainId: 8453 },
    optimism: { url: "https://mainnet.optimism.io", chainId: 10   },
  },
};
