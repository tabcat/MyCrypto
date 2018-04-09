import React from 'react';
import { connect } from 'react-redux';
import translate, { translateRaw } from 'translations';
import { DropdownShell } from 'components/ui';
import NetworkOption from './NetworkOption';
import {
  TChangeNodeIntent,
  changeNodeIntent,
  TRemoveCustomNode,
  removeCustomNode
} from 'actions/config';
import { getNodeId, getNodeConfig, getAllNodes, getAllNetworkConfigs } from 'selectors/config';
import { makeAutoNodeId, isAutoNode } from 'libs/nodes';
import { NodeConfig } from 'types/node';
import { NetworkConfig } from 'types/network';
import { AppState } from 'reducers';
import './NodeDropdown.scss';

const CORE_NETWORKS = ['ETH', 'Ropsten', 'Kovan', 'Rinkeby', 'ETC'];

interface OwnProps {
  openCustomNodeModal(): void;
}

interface StateProps {
  node: NodeConfig;
  nodeSelection: AppState['config']['nodes']['selectedNode']['nodeId'];
  allNodes: { [key: string]: NodeConfig };
  allNetworks: { [key: string]: NetworkConfig };
}

interface DispatchProps {
  changeNodeIntent: TChangeNodeIntent;
  removeCustomNode: TRemoveCustomNode;
}

interface State {
  isShowingAltNetworks: boolean;
  expandedNetwork: null | NetworkConfig;
}

type Props = OwnProps & StateProps & DispatchProps;

class NodeDropdown extends React.Component<Props> {
  public state: State = {
    isShowingAltNetworks: false,
    expandedNetwork: null
  };

  private dropdown: DropdownShell | null;

  public componentDidMount() {
    const { allNodes, nodeSelection } = this.props;
    const node = allNodes[nodeSelection];
    const newState = { ...this.state };
    // Expand alt networks by default if they're on one
    if (!CORE_NETWORKS.includes(node.network)) {
      newState.isShowingAltNetworks = true;
    }
    // Expand the network they're on if they selected a specific node
    if (!isAutoNode(node)) {
      newState.expandedNetwork = this.props.allNetworks[node.network];
    }
    this.setState(newState);
  }

  public render() {
    const { nodeSelection } = this.props;

    return (
      <DropdownShell
        ariaLabel="Dropdown"
        renderLabel={this.renderLabel}
        renderOptions={this.renderOptions}
        disabled={nodeSelection === 'web3'}
        size="smr"
        color="white"
        ref={el => (this.dropdown = el)}
      />
    );
  }

  private renderLabel = () => {
    const node = this.props.allNodes[this.props.nodeSelection];
    return (
      <span>
        {node.network} <small>({node.service})</small>
      </span>
    );
  };

  private renderOptions = () => {
    const { allNodes, allNetworks, nodeSelection } = this.props;
    const { expandedNetwork, isShowingAltNetworks } = this.state;
    const selectedNode = allNodes[nodeSelection];

    const nodesByNetwork = {} as {
      [network: string]: NodeConfig[];
    };
    Object.values(allNodes).forEach((node: NodeConfig) => {
      if (!nodesByNetwork[node.network]) {
        nodesByNetwork[node.network] = [];
      }
      nodesByNetwork[node.network].push(node);
    }, {});

    const options = {
      core: [] as React.ReactElement<any>[],
      alt: [] as React.ReactElement<any>[]
    };
    Object.keys(nodesByNetwork).forEach(netKey => {
      const nodeType = CORE_NETWORKS.includes(netKey) ? 'core' : 'alt';
      options[nodeType].push(
        <NetworkOption
          key={netKey}
          network={allNetworks[netKey]}
          nodes={nodesByNetwork[netKey]}
          nodeSelection={nodeSelection}
          isSelected={selectedNode.network === netKey}
          isExpanded={expandedNetwork === allNetworks[netKey]}
          selectNetwork={this.selectNetwork}
          selectNode={this.selectNode}
          toggleExpand={this.toggleNetworkExpand}
        />
      );
    });

    return (
      <div className="NodeDropdown">
        {options.core}
        <button className="NodeDropdown-alts" onClick={this.toggleShowAltNetworks}>
          <i className="fa fa-flask" />
          {translate(isShowingAltNetworks ? 'HIDE_THING' : 'SHOW_THING', {
            $thing: translateRaw('NETWORKS_ALTERNATIVE')
          })}
        </button>
        {isShowingAltNetworks && options.alt}
        <button className="NodeDropdown-add" onClick={this.openCustomNodeModal}>
          <i className="fa fa-plus" />
          {translate('NODE_ADD')}
        </button>
      </div>
    );
  };

  private selectNetwork = (network: NetworkConfig) => {
    this.props.changeNodeIntent(makeAutoNodeId(network.name));
    if (this.dropdown) {
      this.dropdown.close();
    }
  };

  private selectNode = (node: NodeConfig) => {
    this.props.changeNodeIntent(node.id);
    if (this.dropdown) {
      this.dropdown.close();
    }
  };

  private toggleNetworkExpand = (network: NetworkConfig) => {
    this.setState({
      expandedNetwork: network === this.state.expandedNetwork ? null : network
    });
  };

  private openCustomNodeModal = () => {
    this.props.openCustomNodeModal();
    if (this.dropdown) {
      this.dropdown.close();
    }
  };

  private toggleShowAltNetworks = () => {
    this.setState({ isShowingAltNetworks: !this.state.isShowingAltNetworks });
  };
}

export default connect(
  (state: AppState): StateProps => ({
    nodeSelection: getNodeId(state),
    node: getNodeConfig(state),
    allNodes: getAllNodes(state),
    allNetworks: getAllNetworkConfigs(state)
  }),
  {
    changeNodeIntent,
    removeCustomNode
  }
)(NodeDropdown);
