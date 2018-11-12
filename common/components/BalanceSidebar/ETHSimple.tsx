import React from 'react';
import { connect } from 'react-redux';
import { sha3, bufferToHex } from 'ethereumjs-util';
import { translate, translateRaw } from 'translations';
import { TransactionState } from 'types/transactions';
import { AppState } from 'features/reducers';
import { ensActions, ensSelectors } from 'features/ens';
import { walletSelectors } from 'features/wallet';
import { configSelectors, configMetaSelectors } from 'features/config';
import { notificationsActions } from 'features/notifications';
import {
  transactionFieldsActions,
  transactionNetworkActions,
  transactionSelectors
} from 'features/transaction';
import { transactionsActions } from 'features/transactions';
import { isValidENSAddress } from 'libs/validators';
import { NameState, getNameHash, IBaseSubdomainRequest } from 'libs/ens';
import Contract from 'libs/contracts';
import { Address, Wei } from 'libs/units';
import { Web3Wallet } from 'libs/wallet/non-deterministic';
import { Input, Spinner } from 'components/ui';
import { ConfirmationModal } from 'components/ConfirmationModal';
import { SendButtonFactory } from 'components/SendButtonFactory';
import './ETHSimple.scss';
const constants = require('./ETHSimpleConstants.json');

interface State {
  ethSimpleSubdomainRegistrarInstance: Contract;
  subdomain: string;
  subdomainToDisplay: string;
  domainToCheck: string;
  address: string;
  reverseResolvedName: string;
  network: string;
  isValidDomain: boolean;
  isAvailableDomain: boolean;
  isFocused: boolean;
  isLoading: boolean;
  purchaseClicked: boolean;
  initialPollRequested: boolean;
  pollTimeout: boolean;
  ownedByAddress: boolean;
  supportedNetwork: boolean;
}

interface OwnProps {
  subdomainPurchased(label: string): void;
}

interface StateProps {
  domainRequests: AppState['ens']['domainRequests'];
  broadcast: AppState['transaction']['broadcast'];
  indexingHash: AppState['transaction']['sign']['indexingHash'];
  wallet: AppState['wallet']['inst'];
  isResolving: boolean | null;
  isOffline: ReturnType<typeof configMetaSelectors.getOffline>;
  networkConfig: ReturnType<typeof configSelectors.getNetworkConfig>;
  toChecksumAddress: ReturnType<typeof configSelectors.getChecksumAddressFn>;
  txState: { [txHash: string]: TransactionState };
  transactionBroadcasted: boolean | null;
}

interface DispatchProps {
  resolveDomainRequested: ensActions.TResolveDomainRequested;
  showNotification: notificationsActions.TShowNotification;
  setToField: transactionFieldsActions.TSetToField;
  setValueField: transactionFieldsActions.TSetValueField;
  inputData: transactionFieldsActions.TInputData;
  inputGasLimit: transactionFieldsActions.TInputGasLimit;
  inputGasPrice: transactionFieldsActions.TInputGasPrice;
  getFromRequested: transactionNetworkActions.TGetFromRequested;
  getNonceRequested: transactionNetworkActions.TGetNonceRequested;
  resetTransactionRequested: transactionFieldsActions.TResetTransactionRequested;
  fetchTransactionData: transactionsActions.TFetchTransactionData;
}

type Props = OwnProps & StateProps & DispatchProps;

class ETHSimpleClass extends React.Component<Props, State> {
  public state = {
    ethSimpleSubdomainRegistrarInstance: new Contract(constants.subdomainRegistrarABI),
    subdomain: '',
    subdomainToDisplay: '',
    domainToCheck: '',
    address: '',
    reverseResolvedName: '',
    network: '',
    isFocused: false,
    isValidDomain: false,
    isAvailableDomain: false,
    isLoading: false,
    purchaseClicked: false,
    initialPollRequested: false,
    pollTimeout: false,
    ownedByAddress: false,
    supportedNetwork: false
  };

  public render() {
    const {
      isLoading,
      isValidDomain,
      isAvailableDomain,
      purchaseClicked,
      subdomain,
      ownedByAddress,
      supportedNetwork
    } = this.state;
    const { isResolving } = this.props;
    const validSubdomain = ownedByAddress
      ? ownedByAddress
      : !!subdomain && isValidDomain && isAvailableDomain;
    const purchaseDisabled =
      isResolving || !isAvailableDomain || purchaseClicked || subdomain.length === 0; // || this.props.isOffline
    const description = this.makeDescription(subdomain);
    const statusLabel = this.makeStatusLabel();
    const esDomain = '.' + constants.domain + '.' + constants.tld;

    return supportedNetwork ? (
      <div className="ETHSimple">
        <h5 className="ETHSimple-title">{translate('ETHSIMPLE_TITLE')}</h5>
        <div className="ETHSimple-description">{description}</div>
        <form className="ETHSimpleInput" onSubmit={this.onSubmit}>
          <div className="input-group-wrapper">
            <label className="input-group input-group-inline ETHSimpleInput-name">
              <Input
                value={subdomain}
                isValid={validSubdomain}
                className="border-rad-right-0"
                type="text"
                placeholder="mydomain"
                spellCheck={false}
                onChange={this.onChange}
                onFocus={this.onFocus}
                onBlur={this.onBlur}
                disabled={isLoading}
              />
              <span className="input-group-addon">{esDomain}</span>
            </label>
          </div>
          <SendButtonFactory
            signing={true}
            Modal={ConfirmationModal}
            withProps={({ disabled, signTx, openModal }) => (
              <button
                disabled={disabled || purchaseDisabled}
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
        {statusLabel}
        <div className="row">
          <div className="col-xs-12">
            <a
              href={constants.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ETHSimple-logo"
            />
          </div>
        </div>
      </div>
    ) : (
      <div className="ETHSimple">
        <h5 className="ETHSimple-title">{translate('ETHSIMPLE_TITLE')}</h5>
        <div className="ETHSimple-description">{description}</div>
        <div className="row">
          <div className="col-xs-12">
            <a
              href={constants.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ETHSimple-logo"
            />
          </div>
        </div>
      </div>
    );
  }

  public componentDidMount() {
    if (!this.props.isOffline) {
      this.refreshTxAccountValues();
      this.setAddressAndNetworkFromWallet();
    }
  }

  public componentDidUpdate(prevProps: Props) {
    const { domainRequests, broadcast, indexingHash, txState, isResolving } = this.props;
    const {
      purchaseClicked,
      initialPollRequested,
      subdomain,
      domainToCheck,
      pollTimeout,
      isValidDomain
    } = this.state;
    if (domainRequests !== prevProps.domainRequests) {
      const req = domainRequests[domainToCheck];
      const resolveCompleteAndValid =
        !isResolving &&
        !!req &&
        !!(req.data as IBaseSubdomainRequest) &&
        !req.error &&
        isValidDomain &&
        (req.data as IBaseSubdomainRequest).name === domainToCheck;
      const isAvailableDomain =
        resolveCompleteAndValid && (req.data as IBaseSubdomainRequest).mode === NameState.Open;
      const ownedByAddress =
        resolveCompleteAndValid &&
        (req.data as IBaseSubdomainRequest).ownerAddress === this.state.address;
      const subdomainToDisplay = resolveCompleteAndValid
        ? subdomain.length > 0 ? domainToCheck + '.' + constants.tld : ''
        : this.state.subdomainToDisplay;
      this.setState({
        isAvailableDomain,
        ownedByAddress,
        subdomainToDisplay
      });
      if (resolveCompleteAndValid && isAvailableDomain) {
        this.buildDataForTx(subdomain);
        this.updateTxFields();
      }
    }
    if (broadcast !== prevProps.broadcast) {
      if (
        purchaseClicked &&
        !initialPollRequested &&
        !!indexingHash &&
        indexingHash.length > 0 &&
        !!broadcast[indexingHash]
      ) {
        if ((broadcast as any)[indexingHash as string].broadcastSuccessful) {
          this.setState({ initialPollRequested: true });
          this.pollForHash();
        }
      }
    }
    if (txState !== prevProps.txState) {
      if (
        purchaseClicked &&
        initialPollRequested &&
        !!txState &&
        txState[(broadcast as any)[indexingHash as string].broadcastedHash as string].data
      ) {
        this.refreshTxAccountValues();
        this.props.resolveDomainRequested(domainToCheck, this.props.networkConfig.isTestnet, true);
        this.props.subdomainPurchased(domainToCheck + '.' + constants.tld);
        this.props.showNotification(
          'success',
          translateRaw('ETHSIMPLE_TX_CONFIRMED_MODAL_DESC', {
            $domain: subdomain + '.' + constants.domain + '.' + constants.tld
          }),
          5000
        );
        this.setState({
          isAvailableDomain: false,
          purchaseClicked: false,
          ownedByAddress: true,
          initialPollRequested: false
        });
        this.updateTxFields();
      } else if (!pollTimeout) {
        this.setState({ pollTimeout: true });
        this.pollForHash();
      }
    }
  }

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const subdomain = event.currentTarget.value.toLowerCase().trim();
    const domainToCheck = subdomain + (subdomain.length > 0 ? '.' + constants.domain : '');
    const isValidDomain = isValidENSAddress(domainToCheck + '.' + constants.tld);
    const purchaseClicked = false;
    const ownedByAddress = false;
    if (isValidDomain) {
      this.props.resolveDomainRequested(domainToCheck, this.props.networkConfig.isTestnet);
    }
    this.setState({
      subdomain,
      domainToCheck,
      isValidDomain,
      purchaseClicked,
      ownedByAddress
    });
  };

  private onSubmit = (ev: React.FormEvent<HTMLElement>) => {
    ev.preventDefault();
    this.setState({ purchaseClicked: true });
  };

  private onFocus = () => this.setState({ isFocused: true });
  private onBlur = () => this.setState({ isFocused: false });

  private makeDescription = (subdomain: string) => {
    if (this.state.supportedNetwork) {
      let addr: string;
      if (this.state.address.length > 0) {
        addr = this.state.address;
      } else {
        addr = translateRaw('ETHSIMPLE_DESC_DEFAULT_NO_ADDR');
      }
      const esDomain = '.' + constants.domain + '.' + constants.tld;
      const cutoff = subdomain.length > 10 ? 0 : 15;
      return translate('ETHSIMPLE_DESC', {
        $subdomain:
          (subdomain.length > 0 ? subdomain : translateRaw('ETHSIMPLE_DESC_DEFAULT_SUBDOMAIN')) +
          esDomain,
        $addr: addr.substring(0, addr.length - cutoff) + (cutoff > 0 ? '...' : '')
      });
    } else {
      return translate('ETHSIMPLE_UNSUPPORTED_NETWORK', {
        $network: this.state.network
      });
    }
  };

  private makeStatusLabel = () => {
    const {
      subdomain,
      isValidDomain,
      isAvailableDomain,
      purchaseClicked,
      ownedByAddress,
      subdomainToDisplay
    } = this.state;
    let markup = null;
    let icon = null;
    let className = '';

    if (!!subdomain && !isValidDomain) {
      className = 'help-block is-invalid';
      markup = translate('ENS_SUBDOMAIN_INVALID_INPUT');
    } else if (
      !!subdomainToDisplay &&
      !purchaseClicked &&
      !isAvailableDomain &&
      isValidDomain &&
      !ownedByAddress
    ) {
      className = 'help-block is-invalid';
      icon = <i className="fa fa-remove" />;
      markup = translate('ETHSIMPLE_SUBDOMAIN_UNAVAILABLE', {
        $domain: subdomainToDisplay
      });
    } else if (!!subdomainToDisplay && !purchaseClicked && isAvailableDomain && isValidDomain) {
      className = 'help-block is-valid';
      icon = <i className="fa fa-check" />;
      markup = translate('ETHSIMPLE_SUBDOMAIN_AVAILABLE', {
        $domain: subdomainToDisplay
      });
    } else if (!!subdomain && purchaseClicked && !this.props.transactionBroadcasted) {
      className = 'help-block is-semivalid';
      icon = <Spinner />;
      markup = translate('ETHSIMPLE_WAIT_FOR_USER_SIGN');
    } else if (!!subdomain && purchaseClicked && this.props.transactionBroadcasted) {
      className = 'help-block is-semivalid';
      icon = <Spinner />;
      markup = translate('ETHSIMPLE_WAIT_FOR_CONFIRMATION');
    } else if (!!subdomainToDisplay && !purchaseClicked && !isAvailableDomain && ownedByAddress) {
      className = 'help-block is-valid';
      icon = <i className="fa fa-check" />;
      markup = translate('ETHSIMPLE_SUBDOMAIN_OWNED_BY_USER', {
        $domain: subdomainToDisplay
      });
    }

    return (
      <React.Fragment>
        <span className={className}>
          {icon}
          {markup}
        </span>
      </React.Fragment>
    );
  };

  private setAddressAndNetworkFromWallet = () => {
    if (!!this.props.wallet) {
      const network = (this.props.wallet as Web3Wallet).network;
      if (network !== this.state.network) {
        this.setState({ network });
      }
      const supportedNetwork = constants.supportedNetworks.includes(network);
      if (supportedNetwork !== this.state.supportedNetwork) {
        this.setState({ supportedNetwork });
      }
      const address = this.props.toChecksumAddress(this.props.wallet.getAddressString());
      if (address !== this.state.address && supportedNetwork) {
        this.setState({ address });
        this.updateTxFields();
      }
    }
  };

  private buildDataForTx = (subdomain: string) => {
    const { address } = this.state;
    const inputs = {
      _node: getNameHash(constants.domain + '.' + constants.tld),
      _label: bufferToHex(sha3(subdomain)),
      _newNode: getNameHash(subdomain + '.' + constants.domain + '.' + constants.tld),
      _resolver: constants.publicResolverAddr,
      _owner: address,
      _resolvedAddress: address,
      _contentHash: constants.emptyContentHash
    } as any;
    const encodedInputData = this.state.ethSimpleSubdomainRegistrarInstance.purchaseSubdomain.encodeInput(
      Object.keys(inputs).reduce((accu, key) => ({ ...accu, [key]: inputs[key] }), {})
    );
    this.props.inputData(encodedInputData);
  };

  private updateTxFields = () => {
    const { networkConfig } = this.props;
    const ethSimpleSubdomainRegistrarAddr = networkConfig.isTestnet
      ? constants.subdomainRegistrarAddr.testnet
      : constants.subdomainRegistrarAddr.mainnet;
    this.props.setToField({
      raw: ethSimpleSubdomainRegistrarAddr,
      value: Address(ethSimpleSubdomainRegistrarAddr)
    });
    this.props.setValueField({
      raw: constants.subdomainPriceETH,
      value: Wei(constants.subdomainPriceWei)
    });
    this.props.inputGasPrice(constants.gasPriceGwei);
    this.props.inputGasLimit(constants.gasLimit);
  };

  private refreshTxAccountValues = () => {
    this.props.resetTransactionRequested();
    this.props.getFromRequested();
    this.props.getNonceRequested();
  };

  private pollForHash = () => {
    setTimeout(this.getTxStatus, 10000);
  };

  private getTxStatus = () => {
    this.setState({ pollTimeout: false });
    const { broadcast, indexingHash } = this.props;
    if (
      this.state.purchaseClicked &&
      !!indexingHash &&
      !!broadcast &&
      !!broadcast[indexingHash] &&
      !!(broadcast as any)[indexingHash as string].broadcastedHash
    ) {
      this.props.fetchTransactionData((broadcast as any)[indexingHash as string]
        .broadcastedHash as string);
    }
  };
}

function mapStateToProps(state: AppState): StateProps {
  return {
    broadcast: state.transaction.broadcast,
    indexingHash: state.transaction.sign.indexingHash,
    domainRequests: state.ens.domainRequests,
    txState: state.transactions.txData,
    wallet: walletSelectors.getWalletInst(state),
    isResolving: ensSelectors.getResolvingDomain(state),
    isOffline: configMetaSelectors.getOffline(state),
    networkConfig: configSelectors.getNetworkConfig(state),
    toChecksumAddress: configSelectors.getChecksumAddressFn(state),
    transactionBroadcasted: transactionSelectors.currentTransactionBroadcasted(state)
  };
}

const mapDispatchToProps: DispatchProps = {
  resolveDomainRequested: ensActions.resolveDomainRequested,
  showNotification: notificationsActions.showNotification,
  setToField: transactionFieldsActions.setToField,
  setValueField: transactionFieldsActions.setValueField,
  inputData: transactionFieldsActions.inputData,
  inputGasPrice: transactionFieldsActions.inputGasPrice,
  inputGasLimit: transactionFieldsActions.inputGasLimit,
  getFromRequested: transactionNetworkActions.getFromRequested,
  getNonceRequested: transactionNetworkActions.getNonceRequested,
  resetTransactionRequested: transactionFieldsActions.resetTransactionRequested,
  fetchTransactionData: transactionsActions.fetchTransactionData
};

export default connect(mapStateToProps, mapDispatchToProps)(ETHSimpleClass);
