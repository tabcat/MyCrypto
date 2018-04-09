import React from 'react';
import { translateRaw } from 'translations';
import classnames from 'classnames';
import { isAutoNode, isAutoNodeName } from 'libs/nodes';
import { NodeConfig } from 'types/node';
import { NetworkConfig } from 'types/network';
import NodeOption from './NodeOption';
import './NetworkOption.scss';

interface Props {
  nodes: NodeConfig[];
  network: NetworkConfig;
  nodeSelection: string;
  isSelected: boolean;
  isExpanded: boolean;
  selectNode(node: NodeConfig): void;
  selectNetwork(network: NetworkConfig): void;
  toggleExpand(network: NetworkConfig): void;
}

export default class NetworkOption extends React.PureComponent<Props> {
  public render() {
    const { nodes, network, nodeSelection, isExpanded, isSelected } = this.props;
    const borderLeftColor = network.isCustom ? '#CCC' : network.color;
    const singleNodes = nodes.filter(node => !isAutoNode(node));

    return (
      <div className="NetworkOption" style={{ borderLeftColor }}>
        <div className="NetworkOption-label">
          <div
            className={classnames({
              'NetworkOption-label-name': true,
              'is-selected': isSelected,
              'is-specific-node': isSelected && !isAutoNodeName(nodeSelection)
            })}
            title={translateRaw('NETWORKS_SWITCH', { $network: network.name })}
            onClick={this.handleSelect}
          >
            {network.name}
          </div>
          <button
            className={classnames('NetworkOption-label-expand', isExpanded && 'is-expanded')}
            onClick={this.handleToggleExpand}
          >
            <i className="fa fa-chevron-down" />
          </button>
        </div>
        {isExpanded && (
          <div className="NetworkOption-nodes">
            {singleNodes.map(node => (
              <NodeOption
                key={node.id}
                node={node}
                isSelected={node.id === nodeSelection}
                select={this.props.selectNode}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  private handleSelect = () => {
    this.props.selectNetwork(this.props.network);
  };

  private handleToggleExpand = () => {
    this.props.toggleExpand(this.props.network);
  };
}
