import { RawNodeConfig } from 'types/node';
import { StaticNetworkIds } from 'types/network';

const NODE_CONFIGS: { [key in StaticNetworkIds]: RawNodeConfig[] } = {
  ETH: [
    {
      type: 'rpc',
      name: 'eth_mycrypto',
      service: 'MyCrypto',
      url: 'https://api.mycryptoapi.com/eth'
    },
    {
      type: 'etherscan',
      name: 'eth_ethscan',
      service: 'Etherscan',
      url: 'https://api.etherscan.io/api'
    },
    {
      type: 'infura',
      name: 'eth_infura',
      service: 'Infura',
      url: 'https://mainnet.infura.io/mycrypto'
    },
    {
      type: 'rpc',
      name: 'eth_blockscale',
      service: 'Blockscale',
      url: 'https://api.dev.blockscale.net/dev/parity'
    }
  ],

  Ropsten: [
    {
      type: 'infura',
      name: 'rop_infura',
      service: 'Infura',
      url: 'https://ropsten.infura.io/mycrypto'
    }
  ],

  Kovan: [
    {
      type: 'etherscan',
      name: 'kov_ethscan',
      service: 'Etherscan',
      url: 'https://kovan.etherscan.io/api'
    }
  ],

  Rinkeby: [
    {
      type: 'infura',
      name: 'rin_infura',
      service: 'Infura',
      url: 'https://rinkeby.infura.io/mycrypto'
    },
    {
      type: 'etherscan',
      name: 'rin_ethscan',
      service: 'Etherscan',
      url: 'https://rinkeby.etherscan.io/api'
    }
  ],

  ETC: [
    {
      type: 'rpc',
      name: 'etc_epool',
      service: 'Epool.io',
      url: 'https://mewapi.epool.io'
    }
  ],

  UBQ: [
    {
      type: 'rpc',
      name: 'ubq',
      service: 'ubiqscan.io',
      url: 'https://pyrus2.ubiqscan.io'
    }
  ],

  EXP: [
    {
      type: 'rpc',
      name: 'exp_tech',
      service: 'expanse.tech',
      url: 'https://node.expanse.tech/'
    }
  ],
  POA: [
    {
      type: 'rpc',
      name: 'poa',
      service: 'poa.network',
      url: 'https://core.poa.network'
    }
  ],

  TOMO: [
    {
      type: 'rpc',
      name: 'tomo',
      service: 'tomocoin.io',
      url: 'https://core.tomocoin.io'
    }
  ],

  ELLA: [
    {
      type: 'rpc',
      name: 'ella',
      service: 'ellaism.org',
      url: 'https://jsonrpc.ellaism.org'
    }
  ]
};

export default NODE_CONFIGS;
