import { RawNodeConfig } from 'types/node';
import { StaticNetworkIds } from 'types/network';

const NODE_CONFIGS: { [key in StaticNetworkIds]: RawNodeConfig[] } = {
  ETH: [
    {
      type: 'rpc',
      id: 'eth_mycrypto',
      service: 'MyCrypto',
      url: 'https://api.mycryptoapi.com/eth'
    },
    {
      type: 'etherscan',
      id: 'eth_ethscan',
      service: 'Etherscan',
      url: 'https://api.etherscan.io/api'
    },
    {
      type: 'infura',
      id: 'eth_infura',
      service: 'Infura',
      url: 'https://mainnet.infura.io/mycrypto'
    },
    {
      type: 'rpc',
      id: 'eth_blockscale',
      service: 'Blockscale',
      url: 'https://api.dev.blockscale.net/dev/parity'
    }
  ],

  Ropsten: [
    {
      type: 'infura',
      id: 'rop_infura',
      service: 'Infura',
      url: 'https://ropsten.infura.io/mycrypto'
    }
  ],

  Kovan: [
    {
      type: 'etherscan',
      id: 'kov_ethscan',
      service: 'Etherscan',
      url: 'https://kovan.etherscan.io/api'
    }
  ],

  Rinkeby: [
    {
      type: 'infura',
      id: 'rin_infura',
      service: 'Infura',
      url: 'https://rinkeby.infura.io/mycrypto'
    },
    {
      type: 'etherscan',
      id: 'rin_ethscan',
      service: 'Etherscan',
      url: 'https://rinkeby.etherscan.io/api'
    }
  ],

  ETC: [
    {
      type: 'rpc',
      id: 'etc_epool',
      service: 'Epool.io',
      url: 'https://mewapi.epool.io'
    }
  ],

  UBQ: [
    {
      type: 'rpc',
      id: 'ubq',
      service: 'ubiqscan.io',
      url: 'https://pyrus2.ubiqscan.io'
    }
  ],

  EXP: [
    {
      type: 'rpc',
      id: 'exp_tech',
      service: 'expanse.tech',
      url: 'https://node.expanse.tech/'
    }
  ],
  POA: [
    {
      type: 'rpc',
      id: 'poa',
      service: 'poa.network',
      url: 'https://core.poa.network'
    }
  ],

  TOMO: [
    {
      type: 'rpc',
      id: 'tomo',
      service: 'tomocoin.io',
      url: 'https://core.tomocoin.io'
    }
  ],

  ELLA: [
    {
      type: 'rpc',
      id: 'ella',
      service: 'ellaism.org',
      url: 'https://jsonrpc.ellaism.org'
    }
  ]
};

export default NODE_CONFIGS;
