import { TypeKeys, NodeAction } from 'actions/config';
import { makeAutoNodeId, NODE_CONFIGS, AUTO_NODE_SERVICE } from 'libs/nodes';
import { StaticNodesState } from './types';
import { StaticNetworkIds } from 'types/network';

const makeInitialStateFromConfig = (): StaticNodesState => {
  const state = {} as StaticNodesState;
  Object.entries(NODE_CONFIGS).forEach(([net, nodes]) => {
    // Force key type, even though NODE_CONFIGS defined it
    const network = net as StaticNetworkIds;

    // Add an auto node if we haven't yet
    const estimateGas = network === 'ETH';
    const autoNodeId = makeAutoNodeId(network);
    if (!state[autoNodeId]) {
      state[autoNodeId] = {
        network,
        estimateGas,
        id: autoNodeId,
        isCustom: false,
        service: AUTO_NODE_SERVICE
      };
    }

    // Add all of the individual nodes
    nodes.forEach(node => {
      state[node.id] = {
        network,
        estimateGas,
        id: node.id,
        isCustom: false,
        service: node.service
      };
    });
  });

  return state;
};

export const INITIAL_STATE = makeInitialStateFromConfig();

const staticNodes = (state: StaticNodesState = INITIAL_STATE, action: NodeAction) => {
  switch (action.type) {
    case TypeKeys.CONFIG_NODE_WEB3_SET:
      return { ...state, [action.payload.id]: action.payload.config };
    case TypeKeys.CONFIG_NODE_WEB3_UNSET:
      const stateCopy = { ...state };
      Reflect.deleteProperty(stateCopy, 'web3');
      return stateCopy;
    default:
      return state;
  }
};

export { StaticNodesState, staticNodes };
