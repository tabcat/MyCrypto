import React from 'react';
import { connect } from 'react-redux';
import { sha3, bufferToHex } from 'ethereumjs-util';
import EthTx from 'ethereumjs-tx';

import { translate, translateRaw } from 'translations';
import { TransactionState, TransactionReceipt } from 'types/transactions';
import { AppState } from 'features/reducers';
import { ensActions, ensSelectors } from 'features/ens';
import { configSelectors } from 'features/config';
import { notificationsActions } from 'features/notifications';
import * as derivedSelectors from 'features/selectors';
import {
  transactionFieldsActions,
  transactionNetworkActions,
  transactionSelectors,
  transactionSignSelectors,
  transactionBroadcastTypes,
  transactionNetworkSelectors,
  transactionSignActions
} from 'features/transaction';
import { transactionsActions } from 'features/transactions';
import { IWallet } from 'libs/wallet';
import { isValidENSAddress } from 'libs/validators';
import { getNameHash, NameState, IBaseSubdomainRequest } from 'libs/ens';
import Contract from 'libs/contracts';
import { Address, Wei } from 'libs/units';
import { Web3Wallet } from 'libs/wallet/non-deterministic';
import { Input, Spinner } from 'components/ui';
import { ConfirmationModal } from 'components/ConfirmationModal';
import './ETHSimple.scss';
const constants = require('./ETHSimpleConstants.json');

interface StateProps {
  domainRequests: AppState['ens']['domainRequests'];
  broadcast: AppState['transaction']['broadcast'];
  txNetworkFields: AppState['transaction']['network'];
  notifications: AppState['notifications'];
  indexingHash: AppState['transaction']['sign']['indexingHash'];
  serializedTransaction: AppState['transaction']['sign']['web3']['transaction'];
  isResolving: boolean | null;
  networkConfig: ReturnType<typeof configSelectors.getNetworkConfig>;
  toChecksumAddress: ReturnType<typeof configSelectors.getChecksumAddressFn>;
  txState: { [txHash: string]: TransactionState };
  transactionBroadcasted: boolean | null;
  signaturePending: boolean;
  signedTx: boolean;
  isFullTransaction: boolean;
  validGasPrice: boolean;
  validGasLimit: boolean;
  networkRequestPending: boolean;
  currentTransaction: false | transactionBroadcastTypes.ITransactionStatus | null;
  transaction: EthTx;
}

interface DispatchProps {
  resolveDomainRequested: ensActions.TResolveDomainRequested;
  showNotification: notificationsActions.TShowNotification;
  closeNotification: notificationsActions.TCloseNotification;
  setToField: transactionFieldsActions.TSetToField;
  setValueField: transactionFieldsActions.TSetValueField;
  inputData: transactionFieldsActions.TInputData;
  getFromRequested: transactionNetworkActions.TGetFromRequested;
  getNonceRequested: transactionNetworkActions.TGetNonceRequested;
  resetTransactionRequested: transactionFieldsActions.TResetTransactionRequested;
  signTransactionRequested: transactionSignActions.TSignTransactionRequested;
  fetchTransactionData: transactionsActions.TFetchTransactionData;
}

interface OwnProps {
  wallet: IWallet;
  subdomainPurchased(label: string): void;
}

type Props = StateProps & DispatchProps & OwnProps;

interface State {
  ethSimpleSubdomainRegistrarInstance: Contract;
  subdomain: string;
  subdomainToDisplay: string;
  domainToCheck: string;
  address: string;
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
  showModal: boolean;
  pollingMode: boolean;
  txRepairMode: boolean;
}

class ETHSimpleClass extends React.Component<Props, State> {
  public state = {
    ethSimpleSubdomainRegistrarInstance: new Contract(constants.subdomainRegistrarABI),
    subdomain: '',
    subdomainToDisplay: '',
    domainToCheck: '',
    address: '',
    network: '',
    isFocused: false,
    isValidDomain: false,
    isAvailableDomain: false,
    isLoading: false,
    purchaseClicked: false,
    initialPollRequested: false,
    pollTimeout: false,
    ownedByAddress: false,
    supportedNetwork: false,
    showModal: false,
    pollingMode: false,
    txRepairMode: false
  };

  public render() {
    const {
      isLoading,
      isValidDomain,
      isAvailableDomain,
      purchaseClicked,
      subdomain,
      ownedByAddress,
      supportedNetwork,
      showModal
    } = this.state;
    const {
      isResolving,
      signaturePending,
      signedTx,
      isFullTransaction,
      networkRequestPending,
      validGasPrice,
      validGasLimit
    } = this.props;
    const validSubdomain = ownedByAddress
      ? ownedByAddress
      : !!subdomain && isValidDomain && isAvailableDomain;
    const purchaseDisabled =
      isResolving ||
      purchaseClicked ||
      subdomain.length === 0 ||
      !isFullTransaction ||
      networkRequestPending ||
      !validGasPrice ||
      !validGasLimit ||
      ownedByAddress; // || !isAvailableDomain
    const description = this.generateDescription(subdomain);
    const statusLabel = this.generateStatusLabel();
    const esLogoButton = (
      <div className="row">
        <div className="col-xs-12">
          <a
            href={constants.esURL}
            target="_blank"
            rel="noopener noreferrer"
            className="ETHSimple-logo"
          />
        </div>
      </div>
    );

    return supportedNetwork ? (
      <div className="ETHSimple">
        <h5 className="ETHSimple-title">{translate('ETHSIMPLE_TITLE')}</h5>
        <div className="ETHSimple-description">{description}</div>
        <form className="ETHSimpleInput" onSubmit={this.purchaseSubdomain}>
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
              <span className="input-group-addon">{constants.esFullDomain}</span>
            </label>
          </div>
          <button
            disabled={purchaseDisabled}
            className="ETHSimple-button btn btn-primary btn-block"
            onClick={this.purchaseSubdomain}
          >
            {translate('ETHSIMPLE_ACTION')}
          </button>
        </form>
        {statusLabel}
        {esLogoButton}
        <ConfirmationModal
          isOpen={!signaturePending && signedTx && showModal}
          onClose={this.cancelModal}
        />
      </div>
    ) : (
      <div className="ETHSimple">
        <h5 className="ETHSimple-title">{translate('ETHSIMPLE_TITLE')}</h5>
        <div className="ETHSimple-description">{description}</div>
        {esLogoButton}
      </div>
    );
  }

  public componentDidMount() {
    const { wallet } = this.props;
    const network = (wallet as Web3Wallet).network;
    const supportedNetwork = constants.supportedNetworks.includes(network);
    const address = this.props.toChecksumAddress(wallet.getAddressString());
    this.setState({
      network,
      supportedNetwork,
      address
    });
    this.setAddressAndNetworkFromWallet(supportedNetwork);
  }

  public componentDidUpdate(prevProps: Props) {
    const {
      domainRequests,
      isResolving,
      broadcast,
      txState,
      indexingHash,
      txNetworkFields,
      networkRequestPending,
      isFullTransaction,
      validGasPrice,
      validGasLimit
    } = this.props;
    const {
      purchaseClicked,
      initialPollRequested,
      subdomain,
      domainToCheck,
      pollTimeout,
      isValidDomain,
      isFocused,
      txRepairMode
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
        ? subdomain.length > 0 ? domainToCheck + constants.tld : ''
        : this.state.subdomainToDisplay;
      this.setState(
        {
          isAvailableDomain,
          ownedByAddress,
          subdomainToDisplay
        },
        () => {
          if (resolveCompleteAndValid && isAvailableDomain && isFocused) {
            this.buildTxData();
            this.updateTxFields();
          }
        }
      );
    }
    if (
      txNetworkFields !== prevProps.txNetworkFields &&
      txRepairMode &&
      !networkRequestPending &&
      isFullTransaction &&
      validGasPrice &&
      validGasLimit &&
      this.checkNetworkFields()
    ) {
      this.verifyTx();
    }
    if (broadcast !== prevProps.broadcast) {
      if (
        purchaseClicked &&
        !initialPollRequested &&
        !!(broadcast as any)[indexingHash as string] &&
        (broadcast as any)[indexingHash as string].broadcastSuccessful
      ) {
        this.setState({ initialPollRequested: true });
        this.pollForHash();
      }
    }
    if (txState !== prevProps.txState) {
      if (
        purchaseClicked &&
        initialPollRequested &&
        !!txState &&
        !!txState[(broadcast as any)[indexingHash as string].broadcastedHash as string].receipt &&
        !!(txState[(broadcast as any)[indexingHash as string].broadcastedHash as string]
          .receipt as TransactionReceipt).status &&
        !!(txState[(broadcast as any)[indexingHash as string].broadcastedHash as string]
          .receipt as TransactionReceipt).status === true
      ) {
        this.purchaseComplete();
      } else if (!pollTimeout) {
        this.setState({ pollTimeout: true });
        this.pollForHash();
      }
    }
  }

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const subdomain = event.currentTarget.value.toLowerCase().trim();
    const domainToCheck = subdomain + (subdomain.length > 0 ? constants.esDomain : '');
    const isValidDomain = isValidENSAddress(domainToCheck + constants.tld);
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

  private onFocus = () => {
    this.props.getFromRequested();
    this.props.getNonceRequested();
    if (this.state.subdomain.length > 0) {
      this.updateTxFields();
    }
    this.setState({ isFocused: true });
  };

  private onBlur = () => this.setState({ isFocused: false });

  private generateDescription = (subdomain: string) => {
    const { supportedNetwork, address, network } = this.state;
    if (supportedNetwork) {
      const addr = address.length > 0 ? address : translateRaw('ETHSIMPLE_DESC_DEFAULT_NO_ADDR');
      const cutoff = subdomain.length > 10 ? 0 : 15;
      return translate('ETHSIMPLE_DESC', {
        $subdomain:
          (subdomain.length > 0 ? subdomain : translateRaw('ETHSIMPLE_DESC_DEFAULT_SUBDOMAIN')) +
          constants.esFullDomain,
        $addr: addr.substring(0, addr.length - cutoff) + (cutoff > 0 ? '...' : '')
      });
    } else {
      return translate('ETHSIMPLE_UNSUPPORTED_NETWORK', {
        $network: network
      });
    }
  };

  private generateStatusLabel = () => {
    const {
      subdomain,
      isValidDomain,
      isAvailableDomain,
      purchaseClicked,
      ownedByAddress,
      subdomainToDisplay
    } = this.state;
    const { isResolving } = this.props;
    let markup = null;
    let icon = null;
    let className = '';

    if (!!subdomain && !isValidDomain) {
      className = 'help-block is-invalid';
      markup = translate('ENS_SUBDOMAIN_INVALID_INPUT');
    } else if (isResolving) {
      className = 'help-block is-semivalid';
      icon = <Spinner />;
      markup = `  Resolving ${subdomain + constants.esFullDomain}...`;
    } else if (
      !!subdomainToDisplay &&
      !purchaseClicked &&
      !isAvailableDomain &&
      isValidDomain &&
      !ownedByAddress
    ) {
      className = 'help-block is-invalid';
      icon = <i className="fa fa-remove" />;
      markup = translate('ETHSIMPLE_STATUS_SUBDOMAIN_UNAVAILABLE', {
        $domain: subdomainToDisplay
      });
    } else if (!!subdomainToDisplay && !purchaseClicked && isAvailableDomain && isValidDomain) {
      className = 'help-block is-valid';
      icon = <i className="fa fa-check" />;
      markup = translate('ETHSIMPLE_STATUS_SUBDOMAIN_AVAILABLE', {
        $domain: subdomainToDisplay
      });
    } else if (!!subdomain && purchaseClicked && !this.props.transactionBroadcasted) {
      className = 'help-block is-semivalid';
      icon = <Spinner />;
      markup = translate('ETHSIMPLE_STATUS_WAIT_FOR_USER_CONFIRM');
    } else if (!!subdomain && purchaseClicked && this.props.transactionBroadcasted) {
      className = 'help-block is-semivalid';
      icon = <Spinner />;
      markup = translate('ETHSIMPLE_STATUS_WAIT_FOR_MINE');
    } else if (!!subdomainToDisplay && !purchaseClicked && !isAvailableDomain && ownedByAddress) {
      className = 'help-block is-valid';
      icon = <i className="fa fa-check" />;
      markup = translate('ETHSIMPLE_STATUS_SUBDOMAIN_OWNED_BY_USER', {
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

  private setAddressAndNetworkFromWallet = (supportedNetwork: boolean) => {
    if (!!this.props.wallet) {
      const network = (this.props.wallet as Web3Wallet).network;
      if (network !== this.state.network) {
        this.setState({ network });
      }
      const address = this.props.toChecksumAddress(this.props.wallet.getAddressString());
      if (address !== this.state.address && supportedNetwork) {
        this.setState({ address });
        this.updateTxFields();
      }
    }
  };

  private buildTxData = () => {
    const { address, subdomain } = this.state;
    const inputs = {
      _node: constants.esFullDomainNamehash,
      _label: bufferToHex(sha3(subdomain)),
      _newNode: getNameHash(subdomain + constants.esDomain + constants.tld),
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
    const ethSimpleSubdomainRegistrarAddr = !this.props.networkConfig.isTestnet
      ? constants.subdomainRegistrarAddr.mainnet
      : constants.subdomainRegistrarAddr.ropsten;
    this.props.setToField({
      raw: ethSimpleSubdomainRegistrarAddr,
      value: Address(ethSimpleSubdomainRegistrarAddr)
    });
    this.props.setValueField({
      raw: constants.subdomainPriceETH,
      value: Wei(constants.subdomainPriceWei)
    });
  };

  private purchaseSubdomain = (ev: React.FormEvent<HTMLElement>) => {
    ev.preventDefault();
    this.verifyTx();
  };

  private verifyTx = () => {
    if (this.checkNetworkFields()) {
      this.setState(
        {
          purchaseClicked: true,
          txRepairMode: false,
          initialPollRequested: false
        },
        () => {
          this.props.signTransactionRequested(this.props.transaction);
          this.openModal();
        }
      );
    } else {
      this.repairNetworkFields();
    }
  };

  private checkNetworkFields = () => {
    const { txNetworkFields } = this.props;
    const success = 'SUCCESS';
    if (
      txNetworkFields.gasEstimationStatus === success &&
      txNetworkFields.getFromStatus === success &&
      txNetworkFields.getNonceStatus === success
    ) {
      return true;
    }
    return false;
  };

  private repairNetworkFields = () => {
    const { txNetworkFields } = this.props;
    const success = 'SUCCESS';
    this.setState({ txRepairMode: true }, () => {
      if (txNetworkFields.gasEstimationStatus !== success) {
        this.buildTxData();
        this.updateTxFields();
      }
      if (txNetworkFields.getFromStatus !== success) {
        this.props.getFromRequested();
      }
      if (txNetworkFields.getNonceStatus !== success) {
        this.props.getNonceRequested();
      }
    });
  };

  private purchaseComplete = () => {
    const { subdomain } = this.state;
    this.props.resetTransactionRequested();
    this.props.getNonceRequested();
    this.props.subdomainPurchased(subdomain + constants.esFullDomain);
    this.manageNotifications(subdomain);
    this.setState({
      // isAvailableDomain: false,
      purchaseClicked: false,
      ownedByAddress: true
    });
    setTimeout(this.lookupPurchasedSubdomain, 5000);
  };

  private lookupPurchasedSubdomain = () => {
    const { subdomain } = this.state;
    this.props.resolveDomainRequested(
      subdomain + constants.esDomain,
      this.props.networkConfig.isTestnet,
      true
    );
  };

  private manageNotifications = (subdomain: string) => {
    const { notifications, broadcast, indexingHash } = this.props;
    for (let i = 0; i < notifications.length; i++) {
      const notif = notifications[i];
      if (
        !!notif.componentConfig &&
        !!indexingHash &&
        notif.componentConfig.txHash ===
          (broadcast as any)[indexingHash as string]['broadcastedHash']
      ) {
        this.props.closeNotification(notif);
        break;
      }
    }
    this.props.showNotification(
      'success',
      translateRaw('ETHSIMPLE_SUBDOMAIN_TX_CONFIRMED_MODAL_DESC', {
        $domain: subdomain + constants.esFullDomain
      }),
      10000
    );
  };

  private openModal = () => {
    const { currentTransaction } = this.props;

    if (
      currentTransaction &&
      (currentTransaction.broadcastSuccessful || currentTransaction.isBroadcasting)
    ) {
      return this.props.showNotification(
        'warning',
        'The current transaction is already broadcasting or has been successfully broadcasted'
      );
    }
    this.setState({ showModal: true });
  };

  public UNSAFE_componentWillReceiveProps(nextProps: Props) {
    if (nextProps.transactionBroadcasted && this.state.showModal) {
      this.closeModal(false);
    }
  }

  private cancelModal = () => {
    this.closeModal(true);
  };

  private closeModal = (closedByUser: boolean) => {
    this.setState({
      showModal: false,
      purchaseClicked: !closedByUser
    });
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
    txNetworkFields: state.transaction.network,
    domainRequests: state.ens.domainRequests,
    notifications: state.notifications,
    txState: state.transactions.txData,
    indexingHash: state.transaction.sign.indexingHash,
    isResolving: ensSelectors.getResolvingDomain(state),
    networkConfig: configSelectors.getNetworkConfig(state),
    toChecksumAddress: configSelectors.getChecksumAddressFn(state),
    ...derivedSelectors.getTransaction(state),
    serializedTransaction: derivedSelectors.getSerializedTransaction(state),
    networkRequestPending: transactionNetworkSelectors.isNetworkRequestPending(state),
    validGasPrice: transactionSelectors.isValidGasPrice(state),
    validGasLimit: transactionSelectors.isValidGasLimit(state),
    currentTransaction: transactionSelectors.getCurrentTransactionStatus(state),
    transactionBroadcasted: transactionSelectors.currentTransactionBroadcasted(state),
    signaturePending: derivedSelectors.signaturePending(state).isSignaturePending,
    signedTx:
      !!transactionSignSelectors.getSignedTx(state) || !!transactionSignSelectors.getWeb3Tx(state)
  };
}

const mapDispatchToProps: DispatchProps = {
  resolveDomainRequested: ensActions.resolveDomainRequested,
  showNotification: notificationsActions.showNotification,
  closeNotification: notificationsActions.closeNotification,
  setToField: transactionFieldsActions.setToField,
  setValueField: transactionFieldsActions.setValueField,
  inputData: transactionFieldsActions.inputData,
  getFromRequested: transactionNetworkActions.getFromRequested,
  getNonceRequested: transactionNetworkActions.getNonceRequested,
  resetTransactionRequested: transactionFieldsActions.resetTransactionRequested,
  signTransactionRequested: transactionSignActions.signTransactionRequested,
  fetchTransactionData: transactionsActions.fetchTransactionData
};

export default connect(mapStateToProps, mapDispatchToProps)(ETHSimpleClass);
