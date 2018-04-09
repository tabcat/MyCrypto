import React from 'react';
import { translateRaw } from 'translations';
import classnames from 'classnames';
import { isAutoNode } from 'libs/nodes';
import { NodeConfig } from 'types/node';
import { NetworkConfig } from 'types/network';
import './NetworkOption.scss';

interface Props {
  nodes: NodeConfig[];
  network: NetworkConfig;
  isSelected: boolean;
  isExpanded: boolean;
  select(network: string): void;
  toggleExpand(network: string): void;
}

export default class NetworkOption extends React.PureComponent<Props> {
  public render() {
    const { nodes, network, isExpanded, isSelected } = this.props;
    const borderLeftColor = network.isCustom ? '#CCC' : network.color;
    return (
      <div className="NetworkOption" style={{ borderLeftColor }}>
        <div className="NetworkOption-label">
          <div
            className={classnames('NetworkOption-label-name', isSelected && 'is-selected')}
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
            {nodes.filter(node => !isAutoNode(node)).map(node => (
              <div className="NetworkOption-nodes-node" key={node.service}>
                {node.service}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  private handleSelect = () => {
    this.props.select(this.props.network.name);
  };

  private handleToggleExpand = () => {
    this.props.toggleExpand(this.props.network.name);
  };
}
