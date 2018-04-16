import {
  TChangeNodeIntent,
  TChangeNodeIntentOneTime,
  TAddCustomNode,
  TRemoveCustomNode,
  AddCustomNodeAction,
  changeNodeIntent,
  changeNodeIntentOneTime,
  addCustomNode,
  removeCustomNode
} from 'actions/config';
import { ColorDropdown } from 'components/ui';
import React, { Component } from 'react';
import CustomNodeModal from './CustomNodeModal';
import { NodeConfig } from 'types/node';
import { AppState } from 'reducers';
import {
  getNodeId,
  getNodeConfig,
  CustomNodeOption,
  NodeOption,
  getNodeOptions,
  getNetworkConfig,
  isStaticNodeId
} from 'selectors/config';
import { NetworkConfig } from 'types/network';
import { connect, MapStateToProps } from 'react-redux';
import { stripWeb3Network } from 'libs/nodes';

interface OwnProps {
  networkParam: string | null;
}

interface DispatchProps {
  changeNodeIntent: TChangeNodeIntent;
  changeNodeIntentOneTime: TChangeNodeIntentOneTime;
  addCustomNode: TAddCustomNode;
  removeCustomNode: TRemoveCustomNode;
}

interface StateProps {
  shouldSetNodeFromQS: boolean;
  network: NetworkConfig;
  node: NodeConfig;
  nodeSelection: AppState['config']['nodes']['selectedNode']['nodeId'];
  nodeOptions: (CustomNodeOption | NodeOption)[];
}

const mapStateToProps: MapStateToProps<StateProps, OwnProps, AppState> = (
  state,
  { networkParam }
): StateProps => ({
  shouldSetNodeFromQS: !!(networkParam && isStaticNodeId(state, networkParam)),
  nodeSelection: getNodeId(state),
  node: getNodeConfig(state),
  nodeOptions: getNodeOptions(state),
  network: getNetworkConfig(state)
});

const mapDispatchToProps: DispatchProps = {
  changeNodeIntent,
  changeNodeIntentOneTime,
  addCustomNode,
  removeCustomNode
};

interface State {
  isAddingCustomNode: boolean;
}

type Props = OwnProps & StateProps & DispatchProps;

class NodeDropdown extends Component<Props, State> {
  public state = {
    isAddingCustomNode: false
  };

  public componentDidMount() {
    this.attemptSetNodeFromQueryParameter();
  }

  public render() {
    const { node, nodeSelection, nodeOptions } = this.props;
    const { isAddingCustomNode } = this.state;
    const options = nodeOptions.map(n => {
      if (n.isCustom) {
        const { label, isCustom, id, ...rest } = n;
        return {
          ...rest,
          name: (
            <span>
              {label.network} - {label.nodeName} <small>(custom)</small>
            </span>
          ),
          onRemove: () => this.props.removeCustomNode({ id })
        };
      } else {
        const { label, isCustom, ...rest } = n;
        return {
          ...rest,
          name: (
            <span>
              {stripWeb3Network(label.network)} <small>({label.service})</small>
            </span>
          )
        };
      }
    });

    return (
      <React.Fragment>
        <ColorDropdown
          ariaLabel={`
            change node. current node is on the ${node.network} network
            provided by ${node.service}
          `}
          options={options}
          value={nodeSelection || ''}
          extra={
            <li>
              <a onClick={this.openCustomNodeModal}>Add Custom Node</a>
            </li>
          }
          disabled={nodeSelection === 'web3'}
          onChange={this.props.changeNodeIntent}
          size="smr"
          color="white"
          menuAlign="right"
        />

        <CustomNodeModal
          isOpen={isAddingCustomNode}
          addCustomNode={this.addCustomNode}
          handleClose={this.closeCustomNodeModal}
        />
      </React.Fragment>
    );
  }

  private openCustomNodeModal = () => {
    this.setState({ isAddingCustomNode: true });
  };

  private closeCustomNodeModal = () => {
    this.setState({ isAddingCustomNode: false });
  };

  private addCustomNode = (payload: AddCustomNodeAction['payload']) => {
    this.setState({ isAddingCustomNode: false });
    this.props.addCustomNode(payload);
  };

  private attemptSetNodeFromQueryParameter() {
    const { shouldSetNodeFromQS, networkParam } = this.props;
    if (shouldSetNodeFromQS) {
      this.props.changeNodeIntentOneTime(networkParam!);
    }
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(NodeDropdown);
