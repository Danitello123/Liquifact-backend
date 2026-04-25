/**
 * Stellar network configuration with passphrase-to-RPC validation.
 * Ensures the STELLAR_NETWORK and SOROBAN_RPC_URL are correctly paired.
 * @module config/stellar
 */

const z = require('zod');

const VALID_NETWORKS = ['TESTNET', 'MAINNET', 'FUTURENET'];

const NETWORK_RPC_MAP = {
  TESTNET: 'https://soroban-testnet.stellar.org',
  MAINNET: 'https://soroban.stellar.org',
  FUTURENET: 'https://rpc-futurenet.stellar.org',
};

const NETWORK_PASSPHRASE_MAP = {
  TESTNET: 'Test SDF Network ; September 2015',
  MAINNET: 'Public Global Stellar Network ; September 2014',
  FUTURENET: 'Test SDF Future Network ; October 2022',
};

const StellarConfigSchema = z.object({
  STELLAR_NETWORK: z.enum(VALID_NETWORKS),
  SOROBAN_RPC_URL: z.string().url(),
});

/**
 * Validates STELLAR_NETWORK and SOROBAN_RPC_URL at boot time.
 * Skips validation in test environment to avoid breaking tests.
 * @returns {{network: string, rpcUrl: string, passphrase: string, expectedRpc: string}|null}
 */
function validateStellarConfig() {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  const network = process.env.STELLAR_NETWORK;
  const rpcUrl = process.env.SOROBAN_RPC_URL;

  if (!network) {
    throw new Error('STELLAR_NETWORK is required. Must be one of: TESTNET, MAINNET, FUTURENET');
  }

  if (!VALID_NETWORKS.includes(network)) {
    throw new Error(
      `Invalid STELLAR_NETWORK: "${network}". Must be one of: ${VALID_NETWORKS.join(', ')}`
    );
  }

  if (!rpcUrl) {
    throw new Error('SOROBAN_RPC_URL is required. Must be a valid URL.');
  }

  const expectedRpc = NETWORK_RPC_MAP[network];
  if (rpcUrl !== expectedRpc) {
    throw new Error(
      `Mismatch: STELLAR_NETWORK=${network} requires SOROBAN_RPC_URL="${expectedRpc}", ` +
        `but got "${rpcUrl}". This combination would cause on-chain validation failures.`
    );
  }

  return {
    network,
    rpcUrl,
    passphrase: NETWORK_PASSPHRASE_MAP[network],
    expectedRpc,
  };
}

/**
 * Returns the network passphrase for a given network.
 * @param {string} network - One of TESTNET, MAINNET, FUTURENET.
 * @returns {string} The network passphrase.
 */
function getNetworkPassphrase(network) {
  if (!network || !NETWORK_PASSPHRASE_MAP[network]) {
    throw new Error(`Unknown network: ${network}`);
  }
  return NETWORK_PASSPHRASE_MAP[network];
}

/**
 * Returns the expected RPC URL for a given network.
 * @param {string} network - One of TESTNET, MAINNET, FUTURENET.
 * @returns {string} The expected RPC URL.
 */
function getExpectedRpc(network) {
  if (!network || !NETWORK_RPC_MAP[network]) {
    throw new Error(`Unknown network: ${network}`);
  }
  return NETWORK_RPC_MAP[network];
}

module.exports = {
  validateStellarConfig,
  getNetworkPassphrase,
  getExpectedRpc,
  VALID_NETWORKS,
  NETWORK_RPC_MAP,
  NETWORK_PASSPHRASE_MAP,
  StellarConfigSchema,
};