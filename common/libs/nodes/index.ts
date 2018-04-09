import { shepherd, redux } from 'mycrypto-shepherd';
import { INode } from '.';
import { tokenBalanceHandler } from './tokenBalanceProxy';
import { IProviderConfig } from 'mycrypto-shepherd/dist/lib/ducks/providerConfigs';
import { NodeConfig } from 'types/node';
import NODE_CONFIGS from './configs';

type DeepPartial<T> = Partial<{ [key in keyof T]: Partial<T[key]> }>;

export const makeProviderConfig = (options: DeepPartial<IProviderConfig> = {}): IProviderConfig => {
  const defaultConfig: IProviderConfig = {
    concurrency: 2,
    network: 'ETH',
    requestFailureThreshold: 3,
    supportedMethods: {
      getNetVersion: true,
      ping: true,
      sendCallRequest: true,
      sendCallRequests: true,
      getBalance: true,
      estimateGas: true,
      getTransactionCount: true,
      getCurrentBlock: true,
      sendRawTx: true,

      getTransactionByHash: true,
      getTransactionReceipt: true,

      /*web3 methods*/
      signMessage: true,
      sendTransaction: true
    },
    timeoutThresholdMs: 5000
  };

  return {
    ...defaultConfig,
    ...options,
    supportedMethods: {
      ...defaultConfig.supportedMethods,
      ...(options.supportedMethods ? options.supportedMethods : {})
    }
  };
};
let shepherdProvider: INode;
shepherd
  .init()
  .then(
    provider => (shepherdProvider = (new Proxy(provider, tokenBalanceHandler) as any) as INode)
  );

export const getShepherdManualMode = () =>
  redux.store.getState().providerBalancer.balancerConfig.manual;
export const getShepherdOffline = () =>
  redux.store.getState().providerBalancer.balancerConfig.offline;

export const makeWeb3Network = (network: string) => `WEB3_${network}`;
export const stripWeb3Network = (network: string) => network.replace('WEB3_', '');

export const AUTO_NODE_SERVICE = 'Auto Balanced';
export const makeAutoNodeId = (network: string) => `${network.toLowerCase()}_auto`;
export const isAutoNodeName = (nodeName: string) =>
  nodeName.endsWith('_auto') || nodeName === 'web3';
export const isAutoNode = (node: NodeConfig) => node.service === AUTO_NODE_SERVICE;

/**
 * Assemble shepherd providers from node configs. Includes pseudo-configs
 */
const WEB3_NETWORKS = ['ETH', 'Ropsten', 'Kovan', 'Rinkeby', 'ETC'];
Object.entries(NODE_CONFIGS).forEach(([network, nodes]) => {
  const nodeProviderConf = makeProviderConfig({ network });
  const web3ProviderConf = WEB3_NETWORKS.includes(network)
    ? makeProviderConfig({
        network: makeWeb3Network(network),
        supportedMethods: {
          sendRawTx: false,
          sendTransaction: false,
          signMessage: false
        }
      })
    : null;
  nodes.forEach(n => {
    shepherd.useProvider(n.type, n.id, nodeProviderConf, n.url);
    if (web3ProviderConf) {
      shepherd.useProvider(n.type, `web3_${n.id}`, web3ProviderConf, n.url);
    }
  });
});

export { shepherdProvider, shepherd, NODE_CONFIGS };
export * from './INode';
