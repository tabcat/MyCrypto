import { AppState } from 'reducers';
import { NodeConfig, CustomNodeConfig, StaticNodeConfig, StaticNodeId } from 'types/node';

const getConfig = (state: AppState) => state.config;

import { INITIAL_STATE as SELECTED_NODE_INITIAL_STATE } from 'reducers/config/nodes/selectedNode';
import { shepherdProvider, INode, stripWeb3Network } from 'libs/nodes';

export const getNodes = (state: AppState) => getConfig(state).nodes;

export function isNodeCustom(state: AppState, nodeId: string): CustomNodeConfig | undefined {
  return getCustomNodeConfigs(state)[nodeId];
}

export const getCustomNodeFromId = (
  state: AppState,
  nodeId: string
): CustomNodeConfig | undefined => getCustomNodeConfigs(state)[nodeId];

export const getStaticAltNodeIdToWeb3 = (state: AppState) => {
  const { web3, ...configs } = getStaticNodeConfigs(state);
  if (!web3) {
    return SELECTED_NODE_INITIAL_STATE.nodeId;
  }
  const res = Object.entries(configs).find(
    ([_, config]: [StaticNodeId, StaticNodeConfig]) =>
      stripWeb3Network(web3.network) === config.network
  );
  if (res) {
    return res[0];
  }
  return SELECTED_NODE_INITIAL_STATE.nodeId;
};

export const getStaticNodeFromId = (state: AppState, nodeId: StaticNodeId) =>
  getStaticNodeConfigs(state)[nodeId];

export const isStaticNodeId = (state: AppState, nodeId: string): nodeId is StaticNodeId =>
  Object.keys(getStaticNodeConfigs(state)).includes(nodeId);

const getStaticNodeConfigs = (state: AppState) => getNodes(state).staticNodes;

export const getStaticNodeConfig = (state: AppState) => {
  const { staticNodes, selectedNode: { nodeId } } = getNodes(state);

  const defaultNetwork = isStaticNodeId(state, nodeId) ? staticNodes[nodeId] : undefined;
  return defaultNetwork;
};

export const getWeb3Node = (state: AppState): StaticNodeConfig | null => {
  const isWeb3Node = (nodeId: string) => nodeId === 'web3';
  const currNode = getStaticNodeConfig(state);
  const currNodeId = getNodeId(state);
  if (currNode && currNodeId && isWeb3Node(currNodeId)) {
    return currNode;
  }
  return null;
};

export const getCustomNodeConfig = (state: AppState): CustomNodeConfig | undefined => {
  const { customNodes, selectedNode: { nodeId } } = getNodes(state);

  const customNode = customNodes[nodeId];
  return customNode;
};

export function getCustomNodeConfigs(state: AppState) {
  return getNodes(state).customNodes;
}

export function getStaticNodes(state: AppState) {
  return getNodes(state).staticNodes;
}

export function getSelectedNode(state: AppState) {
  return getNodes(state).selectedNode;
}

export function isNodeChanging(state: AppState): boolean {
  return getSelectedNode(state).pending;
}

export function getNodeId(state: AppState): string {
  return getSelectedNode(state).nodeId;
}

export function getIsWeb3Node(state: AppState): boolean {
  return getNodeId(state) === 'web3';
}

export function getNodeConfig(state: AppState): StaticNodeConfig | CustomNodeConfig {
  const config = getStaticNodeConfig(state) || getCustomNodeConfig(state);

  if (!config) {
    const { selectedNode } = getNodes(state);
    throw Error(`No node config found for ${selectedNode.nodeId} in either static or custom nodes`);
  }
  return config;
}

export function getNodeLib(_: AppState): INode {
  return shepherdProvider;
}

export interface NodeOption {
  isCustom: false;
  value: string;
  label: { network: string; service: string };
  color?: string;
  hidden?: boolean;
}

export function getAllNodes(
  state: AppState
): {
  [key: string]: NodeConfig;
} {
  return {
    ...getStaticNodes(state),
    ...getCustomNodeConfigs(state)
  };
}
