import React, { Component } from 'react';
import { connect } from 'react-redux';
import Markdown from 'react-markdown';
import { sha3, bufferToHex } from 'ethereumjs-util';
import BN from 'bn.js';
import { translate, translateRaw } from 'translations';
import { NetworkConfig } from 'types/network';
import { AppState } from 'features/reducers';
import { ensActions } from 'features/ens';
import { walletSelectors } from 'features/wallet';
import { configSelectors, configMetaSelectors } from 'features/config';
import { notificationsActions } from 'features/notifications';
import {
  transactionSelectors,
  transactionFieldsActions,
  transactionNetworkActions,
  transactionNetworkSelectors
} from 'features/transaction';
import { isValidENSAddress } from 'libs/validators';
import { NameState, getNameHash } from 'libs/ens';
import Contract from 'libs/contracts';
import { Address, Wei } from 'libs/units';
import { Input, NewTabLink } from 'components/ui';
import { ConfirmationModal } from 'components/ConfirmationModal';
import { SendButtonFactory } from 'components/SendButtonFactory';
import './ETHSimple.scss';

interface State {
  subdomain: string;
  domainToCheck: string;
  isValidDomain: boolean;
  isAvailableDomain: boolean;
  isFocused: boolean;
  isResolving: boolean;
  isLoading: boolean;
  description: string;
  signing?: boolean;
  override: boolean;
}

interface StateProps {
  domainRequests: AppState['ens']['domainRequests'];
  wallet: AppState['wallet']['inst'];
  network: NetworkConfig;
  offline: boolean;
  networkRequestPending: boolean;
  validGasPrice: boolean;
  validGasLimit: boolean;
}

interface DispatchProps {
  resolveDomainRequested: ensActions.TResolveDomainRequested;
  showNotification: notificationsActions.TShowNotification;
  setToField: transactionFieldsActions.TSetToField;
  setDataField: transactionFieldsActions.TSetDataField;
  setNonceField: transactionFieldsActions.TSetNonceField;
  setValueField: transactionFieldsActions.TSetValueField;
  setGasPriceField: transactionFieldsActions.TSetGasPriceField;
  setGasLimitField: transactionFieldsActions.TSetGasLimitField;
  getFromRequested: transactionNetworkActions.TGetFromRequested;
  getNonceRequested: transactionNetworkActions.TGetNonceRequested;
  resetTransactionRequested: transactionFieldsActions.TResetTransactionRequested;
}

type Props = StateProps & DispatchProps;

export class ETHSimpleClass extends Component<Props, State> {
  public initialState: State = {
    isFocused: false,
    isValidDomain: false,
    isAvailableDomain: false,
    isResolving: false,
    isLoading: false,
    override: false,
    subdomain: '',
    domainToCheck: '',
    description: this.buildDesc()
  };

  public state: State = this.initialState;

  private buildDesc() {
    let addr: string;
    if (this.props.wallet) addr = this.props.wallet.getAddressString();
    else addr = translateRaw('ETHSIMPLE_DESC_DEFAULT_NO_ADDR');
    return (
      translateRaw('ETHSIMPLE_DESC_0') +
      translateRaw('ETHSIMPLE_DESC_DEFAULT_SUBDOMAIN') +
      translateRaw('ETHSIMPLE_DESC_1') +
      '`' +
      addr.substring(0, 25) +
      '...`'
    );
  }

  public render() {
    const { isLoading, isValidDomain, isAvailableDomain, subdomain, description } = this.state;

    return (
      <div className="ETHSimple">
        <h5 className="ETHSimple-title">{translate('ETHSIMPLE_TITLE')}</h5>
        <div className="ETHSimple-description">
          <Markdown
            escapeHtml={true}
            unwrapDisallowed={true}
            allowedTypes={['inlineCode']}
            renderers={{
              root: React.Fragment,
              link: NewTabLink
            }}
            source={description}
          />
        </div>
        <form className="ETHSimpleInput" onSubmit={this.onSubmit}>
          <div className="input-group-wrapper">
            <label className="input-group input-group-inline ETHSimpleInput-name">
              <Input
                value={subdomain}
                isValid={!!subdomain && isValidDomain && isAvailableDomain}
                className="border-rad-right-0"
                type="text"
                placeholder="mydomain"
                onChange={this.onChange}
                onFocus={this.onFocus}
                onBlur={this.onBlur}
                disabled={isLoading}
              />
              <span className="input-group-addon">.ethsimple.eth</span>
            </label>
            {subdomain &&
              !isValidDomain && (
                <p className="help-block is-invalid">{translate('ENS_SUBDOMAIN_INVALID_INPUT')}</p>
              )}
            {subdomain &&
              !isAvailableDomain &&
              isValidDomain && <p className="help-block is-invalid">Domain unavailable</p>}
          </div>
          <SendButtonFactory
            signing={true}
            Modal={ConfirmationModal}
            withProps={({ disabled, signTx, openModal }) => (
              <button
                disabled={disabled && this.state.override}
                className="ETHSimple-button btn btn-primary btn-block"
                onClick={() => {
                  signTx();
                  openModal();
                }}
              >
                {translate('ETHSIMPLE_ACTION')}
              </button>
            )}
          />
        </form>
        <div className="row">
          <div className="col-xs-12">
            <a
              href="https://ethsimple.com"
              target="_blank"
              rel="noopener noreferrer"
              className="ETHSimple-logo"
            />
          </div>
        </div>
      </div>
    );
  }

  public componentWillMount() {
    if (!this.props.offline) this.props.resetTransactionRequested();
  }

  public componentDidMount() {
    if (!this.props.offline) {
      this.props.getNonceRequested();
      this.props.getFromRequested();
    }
  }

  componentDidUpdate(prevProps: Props) {
    const { domainRequests } = this.props;
    if (domainRequests !== prevProps.domainRequests) {
      const { domainToCheck } = this.state;
      const req = domainRequests[domainToCheck]; // get data for current domain
      const isResolving = req && !req.data && !req.error; // if no data and no error then the lookup is still processing
      const isAvailableDomain =
        !isResolving && req && req.data && !req.error && req.data.mode !== NameState.Open // domain is available if resolving has completed, the domain request has data,
          ? false
          : true;
      let override = this.state.override;
      if (!isAvailableDomain || isResolving) override = false;
      this.setState({
        isResolving,
        isAvailableDomain,
        override
      });
    }
  }

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const subdomain = event.currentTarget.value.toLowerCase().trim();
    const domainToCheck = subdomain + (subdomain.length > 0 ? '.ethsimple' : '');
    const isValidDomain = isValidENSAddress(domainToCheck + '.eth');
    let isAvailableDomain = this.state.isAvailableDomain;
    let description = this.state.description;
    let override = this.state.override;
    if (isValidDomain) {
      this.props.resolveDomainRequested(domainToCheck);
      isAvailableDomain = true;
      description = this.makeDescription(subdomain);
      override = true;
    }
    this.setState({
      subdomain,
      domainToCheck,
      isValidDomain,
      isAvailableDomain,
      description,
      override
    });
    if (isValidDomain) this.buildTX(subdomain);
  };

  private onSubmit = (ev: React.FormEvent<HTMLElement>) => {
    ev.preventDefault();
  };

  private onFocus = () => this.setState({ isFocused: true });
  private onBlur = () => this.setState({ isFocused: false });

  private makeDescription = (domain: string) => {
    let addr: string;
    if (this.props.wallet) addr = this.props.wallet.getAddressString();
    else addr = translateRaw('ETHSIMPLE_DESC_DEFAULT_NO_ADDR');
    return (
      translateRaw('ETHSIMPLE_DESC_0') +
      (domain.length > 0 ? domain : translateRaw('ETHSIMPLE_DESC_DEFAULT_SUBDOMAIN')) +
      translateRaw('ETHSIMPLE_DESC_1') +
      '`' +
      addr.substring(0, 25) +
      '...`'
    );
  };

  private buildTX = (subdomain: string) => {
    if (this.props.wallet) {
      const { wallet } = this.props;

      const publicResolverAddr = '0x5ffc014343cd971b7eb70732021e26c35b744cc4';
      const emptyContentHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const ethSimpleDomain = 'ethsimple.eth';
      const subdomainPriceETH = '0.0079';
      const subdomainPriceWei = '7900000000000000';
      const gasPriceGwei = '2';
      const gasPriceWei = '2000000000';
      const gasLimit = '150000';

      const ethSimpleSubdomainRegistrarAddr = '0x5E307a315186a92d281F62e7E2aFb6AA2292dD42'; // if (this.props.network.isTestnet)
      const ethSimpleSubdomainRegistrarABI = [
        {
          constant: false,
          inputs: [
            { name: '_node', type: 'bytes32' },
            { name: '_label', type: 'bytes32' },
            { name: '_newNode', type: 'bytes32' },
            { name: '_resolver', type: 'address' },
            { name: '_owner', type: 'address' },
            { name: '_resolvedAddress', type: 'address' },
            { name: '_contentHash', type: 'bytes32' }
          ],
          name: 'purchaseSubdomain',
          outputs: [],
          payable: true,
          stateMutability: 'payable',
          type: 'function'
        },
        {
          constant: false,
          inputs: [],
          name: 'returnDomainOwnership',
          outputs: [],
          payable: false,
          stateMutability: 'nonpayable',
          type: 'function'
        },
        {
          constant: false,
          inputs: [{ name: '_price', type: 'uint256' }],
          name: 'setSubdomainPrice',
          outputs: [],
          payable: false,
          stateMutability: 'nonpayable',
          type: 'function'
        },
        {
          constant: false,
          inputs: [],
          name: 'withdraw',
          outputs: [],
          payable: false,
          stateMutability: 'nonpayable',
          type: 'function'
        },
        {
          inputs: [{ name: 'network_id', type: 'uint256' }, { name: '_price', type: 'uint256' }],
          payable: false,
          stateMutability: 'nonpayable',
          type: 'constructor'
        },
        {
          constant: true,
          inputs: [],
          name: 'ensFactory',
          outputs: [{ name: '', type: 'address' }],
          payable: false,
          stateMutability: 'view',
          type: 'function'
        },
        {
          constant: true,
          inputs: [],
          name: 'registrar',
          outputs: [{ name: '', type: 'address' }],
          payable: false,
          stateMutability: 'view',
          type: 'function'
        },
        {
          constant: true,
          inputs: [],
          name: 'registrarOwner',
          outputs: [{ name: '', type: 'address' }],
          payable: false,
          stateMutability: 'view',
          type: 'function'
        },
        {
          constant: true,
          inputs: [],
          name: 'registry',
          outputs: [{ name: '', type: 'address' }],
          payable: false,
          stateMutability: 'view',
          type: 'function'
        },
        {
          constant: true,
          inputs: [],
          name: 'resolver',
          outputs: [{ name: '', type: 'address' }],
          payable: false,
          stateMutability: 'view',
          type: 'function'
        },
        {
          constant: true,
          inputs: [],
          name: 'reverseRegistrar',
          outputs: [{ name: '', type: 'address' }],
          payable: false,
          stateMutability: 'view',
          type: 'function'
        }
      ];
      let ethSimpleSubdomainRegistrarInstance = new Contract(ethSimpleSubdomainRegistrarABI);

      let inputs = {
        _node: {
          rawData: getNameHash(ethSimpleDomain),
          parsedData: getNameHash(ethSimpleDomain)
        },
        _label: {
          rawData: bufferToHex(sha3(subdomain)),
          parsedData: bufferToHex(sha3(subdomain))
        },
        _newNode: {
          rawData: getNameHash(subdomain + '.' + ethSimpleDomain),
          parsedData: getNameHash(subdomain + '.' + ethSimpleDomain)
        },
        _resolver: {
          rawData: publicResolverAddr,
          parsedData: bufferToHex(Address(publicResolverAddr))
        },
        _owner: {
          rawData: wallet.getAddressString(),
          parsedData: bufferToHex(Address(wallet.getAddressString()))
        },
        _resolvedAddress: {
          rawData: wallet.getAddressString(),
          parsedData: bufferToHex(Address(wallet.getAddressString()))
        },
        _contentHash: {
          rawData: emptyContentHash,
          parsedData: emptyContentHash
        }
      } as any;

      const parsedInputs = Object.keys(inputs).reduce(
        (accu, key) => ({ ...accu, [key]: inputs[key].parsedData }),
        {}
      );

      let rawInputData =
        inputs._node.rawData +
        inputs._label.rawData +
        inputs._newNode.rawData +
        inputs._resolver.rawData +
        inputs._owner.rawData +
        inputs._resolvedAddress.rawData +
        inputs._contentHash.rawData;

      let encodedInputData = ethSimpleSubdomainRegistrarInstance.purchaseSubdomain.encodeInput(
        parsedInputs
      );

      this.props.setToField({
        raw: ethSimpleSubdomainRegistrarAddr,
        value: Address(ethSimpleSubdomainRegistrarAddr)
      });
      this.props.setDataField({
        raw: rawInputData,
        value: encodedInputData
      });
      this.props.setValueField({
        raw: subdomainPriceETH,
        value: Wei(subdomainPriceWei)
      });
      this.props.setGasPriceField({
        raw: gasPriceGwei,
        value: Wei(gasPriceWei)
      });
      this.props.setGasLimitField({
        raw: gasLimit,
        value: new BN(gasLimit)
      });
    }
  };
}

function mapStateToProps(state: AppState): StateProps {
  return {
    domainRequests: state.ens.domainRequests,
    wallet: walletSelectors.getWalletInst(state),
    offline: configMetaSelectors.getOffline(state),
    networkRequestPending: transactionNetworkSelectors.isNetworkRequestPending(state),
    validGasPrice: transactionSelectors.isValidGasPrice(state),
    validGasLimit: transactionSelectors.isValidGasLimit(state),
    network: configSelectors.getNetworkConfig(state)
  };
}

const mapDispatchToProps: DispatchProps = {
  resolveDomainRequested: ensActions.resolveDomainRequested,
  showNotification: notificationsActions.showNotification,
  setToField: transactionFieldsActions.setToField,
  setDataField: transactionFieldsActions.setDataField,
  setNonceField: transactionFieldsActions.setNonceField,
  setValueField: transactionFieldsActions.setValueField,
  setGasPriceField: transactionFieldsActions.setGasPriceField,
  setGasLimitField: transactionFieldsActions.setGasLimitField,
  getFromRequested: transactionNetworkActions.getFromRequested,
  getNonceRequested: transactionNetworkActions.getNonceRequested,
  resetTransactionRequested: transactionFieldsActions.resetTransactionRequested
};

export default connect(mapStateToProps, mapDispatchToProps)(ETHSimpleClass);
