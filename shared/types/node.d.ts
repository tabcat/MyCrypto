import { INode } from 'libs/nodes';
import { StaticNetworkIds } from './network';
import { StaticNodesState, CustomNodesState } from 'reducers/config/nodes';

interface RawNodeConfig {
  id: string;
  type: 'rpc' | 'etherscan' | 'infura' | 'web3' | 'myccustom';
  service: string;
  url: string;
}

interface CustomNodeConfig {
  id: string;
  isCustom: true;
  name: string;
  service: 'your custom node';
  url: string;
  network: string;
  auth?: {
    username: string;
    password: string;
  };
}

interface StaticNodeConfig {
  id: string;
  isCustom: false;
  network: StaticNetworkIds;
  service: string;
  estimateGas?: boolean;
  hidden?: boolean;
}

type StaticNodeId = string;

type StaticNodeConfigs = { [key in StaticNodeId]: StaticNodeConfig } & { web3?: StaticNodeConfig };

type NodeConfig = StaticNodesState[StaticNodeId] | CustomNodesState[string];
