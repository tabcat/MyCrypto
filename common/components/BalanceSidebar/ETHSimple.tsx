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
import { getTransactionFields } from 'libs/transaction/utils/ether';
import { Input, Spinner } from 'components/ui';
import { ConfirmationModal } from 'components/ConfirmationModal';
import './ETHSimple.scss';
const constants = require('./ETHSimpleConstants.json');

interface StateProps {
  domainRequests: AppState['ens']['domainRequests'];
  txNetworkFields: AppState['transaction']['network'];
  notifications: AppState['notifications'];
  isResolving: boolean | null;
  networkConfig: ReturnType<typeof configSelectors.getNetworkConfig>;
  toChecksumAddress: ReturnType<typeof configSelectors.getChecksumAddressFn>;
  txState: { [txHash: string]: TransactionState };
  transactionBroadcasted: boolean | null;
  signaturePending: boolean;
  signedTx: boolean;
  isFullTransaction: boolean;
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
  inputGasLimit: transactionFieldsActions.TInputGasLimit;
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
  isFocused: boolean;
  isLoading: boolean;
  purchaseClicked: boolean;
  initialPollRequested: boolean;
  pollTimeout: boolean;
  supportedNetwork: boolean;
  showModal: boolean;
  domainRequest: IBaseSubdomainRequest | null;
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
    isLoading: false,
    purchaseClicked: false,
    initialPollRequested: false,
    pollTimeout: false,
    supportedNetwork: false,
    showModal: false,
    domainRequest: null
  };

  public render() {
    const {
      isLoading,
      isValidDomain,
      purchaseClicked,
      subdomain,
      supportedNetwork,
      showModal,
      domainToCheck
    } = this.state;
    const {
      isResolving,
      signaturePending,
      signedTx,
      networkRequestPending,
      domainRequests,
      wallet
    } = this.props;
    const validSubdomain = !!subdomain && isValidDomain;
    const req = domainRequests[domainToCheck];
    const isAvailableDomain =
      !!req && !!req.data ? (req.data as IBaseSubdomainRequest).mode === NameState.Open : false;
    const ownedByThisAddress =
      !!req && !!req.data
        ? (req.data as IBaseSubdomainRequest).ownerAddress ===
          this.props.toChecksumAddress(wallet.getAddressString())
        : false;
    const purchaseDisabled =
      !validSubdomain ||
      isResolving ||
      purchaseClicked ||
      subdomain.length < 1 ||
      networkRequestPending ||
      !isAvailableDomain ||
      ownedByThisAddress;
    const description = this.generateDescription();
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
            <label className="input-group input-group-inline">
              <Input
                value={subdomain}
                isValid={validSubdomain}
                className="border-rad-right-0 ETHSimple-name"
                type="text"
                placeholder="mydomain"
                spellCheck={false}
                onChange={this.onChange}
                onFocus={this.onFocus}
                onBlur={this.onBlur}
                disabled={isLoading}
              />
              <span className="input-group-addon ETHSimple-name">{constants.esFullDomain}</span>
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
    this.setNetworkAndAddress();
  }

  public componentDidUpdate(prevProps: Props) {
    const {
      domainRequests,
      isResolving,
      txState,
      txNetworkFields,
      networkRequestPending,
      isFullTransaction,
      validGasLimit,
      currentTransaction,
      wallet,
      networkConfig,
      signaturePending
    } = this.props;
    const {
      purchaseClicked,
      initialPollRequested,
      domainToCheck,
      pollTimeout,
      isValidDomain
    } = this.state;
    if (wallet !== prevProps.wallet || networkConfig !== prevProps.networkConfig) {
      this.setNetworkAndAddress();
    }
    if (domainRequests !== prevProps.domainRequests) {
      const req = domainRequests[domainToCheck];
      const resolveCompleteAndValid =
        !isResolving &&
        isValidDomain &&
        !!req &&
        !req.error &&
        !!(req.data as IBaseSubdomainRequest) &&
        (req.data as IBaseSubdomainRequest).name === domainToCheck;
      if (resolveCompleteAndValid && !!req.data) {
        const domainRequest = req.data as IBaseSubdomainRequest;
        this.setState({ domainRequest });
      }
    }
    if (txNetworkFields !== prevProps.txNetworkFields) {
      if (
        purchaseClicked &&
        !signaturePending &&
        !networkRequestPending &&
        isFullTransaction &&
        validGasLimit &&
        this.checkNetworkFields() &&
        this.checkTxFields()
      ) {
        this.props.signTransactionRequested(this.props.transaction);
        this.openModal();
      }
    }
    if (currentTransaction !== prevProps.currentTransaction) {
      if (
        purchaseClicked &&
        !initialPollRequested &&
        !!currentTransaction &&
        currentTransaction.broadcastSuccessful
      ) {
        this.setState({ initialPollRequested: true });
        this.pollForHash();
      } else if (
        purchaseClicked &&
        !!currentTransaction &&
        !!prevProps.currentTransaction &&
        !prevProps.currentTransaction.broadcastSuccessful &&
        prevProps.currentTransaction.isBroadcasting &&
        !currentTransaction.broadcastSuccessful &&
        !currentTransaction.isBroadcasting
      ) {
        this.setState({
          purchaseClicked: false
        });
      }
    }
    if (txState !== prevProps.txState) {
      if (
        purchaseClicked &&
        initialPollRequested &&
        !!currentTransaction &&
        !!currentTransaction.broadcastedHash &&
        !!txState[currentTransaction.broadcastedHash].receipt &&
        !!(txState[currentTransaction.broadcastedHash].receipt as TransactionReceipt).status &&
        (txState[currentTransaction.broadcastedHash].receipt as TransactionReceipt).status === 1
      ) {
        this.purchaseComplete();
      } else if (!pollTimeout) {
        this.setState({ pollTimeout: true }, () => {
          this.pollForHash();
        });
      }
    }
  }

  private setNetworkAndAddress = () => {
    const { wallet, networkConfig } = this.props;
    const network = networkConfig.id;
    const supportedNetwork = constants.supportedNetworks.includes(network);
    const address = this.props.toChecksumAddress(wallet.getAddressString());
    this.setState({
      network,
      supportedNetwork,
      address
    });
  };

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const subdomain = event.currentTarget.value.toLowerCase().trim();
    const purchaseClicked = false;
    const subdomainEntered = subdomain.length > 0;
    const isValidDomain = subdomainEntered
      ? isValidENSAddress(subdomain + constants.esFullDomain)
      : false;
    const domainToCheck = isValidDomain ? subdomain + constants.esDomain : this.state.domainToCheck;
    const subdomainToDisplay = subdomainEntered ? domainToCheck + constants.tld : '';
    const domainRequest = subdomainEntered ? this.state.domainRequest : null;
    this.setState(
      {
        subdomain,
        domainToCheck,
        isValidDomain,
        purchaseClicked,
        subdomainToDisplay,
        domainRequest
      },
      () => {
        if (isValidDomain) {
          this.props.resolveDomainRequested(domainToCheck, this.props.networkConfig.isTestnet);
        }
        if (!subdomainEntered) {
          this.props.resetTransactionRequested();
        }
      }
    );
  };

  private onFocus = () => {
    this.props.resetTransactionRequested();
    this.props.getNonceRequested();
    this.setState({ isFocused: true });
  };

  private onBlur = () => this.setState({ isFocused: false });

  private generateDescription = () => {
    const { supportedNetwork, address, network, subdomainToDisplay } = this.state;
    if (supportedNetwork) {
      const addr = address.length > 0 ? address : translateRaw('ETHSIMPLE_DESC_DEFAULT_NO_ADDR');
      const cutoff = subdomainToDisplay.length > 24 ? 0 : 15;
      return translate('ETHSIMPLE_DESC', {
        $subdomain:
          subdomainToDisplay.length > 0
            ? subdomainToDisplay
            : translateRaw('ETHSIMPLE_DESC_DEFAULT_SUBDOMAIN'),
        $addr: addr.substring(0, addr.length - cutoff) + (cutoff > 0 ? '...' : '')
      });
    } else {
      return translate('ETHSIMPLE_UNSUPPORTED_NETWORK', {
        $network: network
      });
    }
  };

  private generateStatusLabel = () => {
    const { subdomain, isValidDomain, purchaseClicked, domainToCheck } = this.state;
    const { isResolving, wallet, domainRequests } = this.props;
    let markup = null;
    let icon = null;
    let className = '';
    let refreshIcon = null;
    const req = domainRequests[domainToCheck];
    const isAvailableDomain =
      !!req && !!req.data ? (req.data as IBaseSubdomainRequest).mode === NameState.Open : false;
    const ownedByThisAddress =
      !!req && !!req.data
        ? (req.data as IBaseSubdomainRequest).ownerAddress ===
          this.props.toChecksumAddress(wallet.getAddressString())
        : false;

    if (!!subdomain && !isValidDomain) {
      className = 'help-block is-invalid';
      markup = translate('ENS_SUBDOMAIN_INVALID_INPUT');
    } else if (isResolving) {
      className = 'help-block is-semivalid';
      icon = <Spinner />;
      markup = translate('ETHSIMPLE_STATUS_RESOLVING_SUBDOMAIN', {
        $domain: subdomain + constants.esFullDomain
      });
    } else if (
      !purchaseClicked &&
      !isAvailableDomain &&
      isValidDomain &&
      !ownedByThisAddress &&
      !!req &&
      !!req.data
    ) {
      className = 'help-block is-invalid';
      icon = <i className="fa fa-remove" />;
      markup = translate('ETHSIMPLE_STATUS_SUBDOMAIN_UNAVAILABLE', {
        $domain: subdomain + constants.esFullDomain
      });
    } else if (!purchaseClicked && isAvailableDomain && isValidDomain && !!req && !!req.data) {
      className = 'help-block is-valid';
      icon = <i className="fa fa-check" />;
      markup = translate('ETHSIMPLE_STATUS_SUBDOMAIN_AVAILABLE', {
        $domain: (req.data as IBaseSubdomainRequest).name + constants.tld
      });
      refreshIcon = (
        <button className="ETHSimple-section-refresh" onClick={this.refreshDomainResolution}>
          <i className="fa fa-refresh" />
        </button>
      );
    } else if (!!subdomain && purchaseClicked && !this.props.transactionBroadcasted) {
      className = 'help-block is-semivalid';
      icon = <Spinner />;
      markup = translate('ETHSIMPLE_STATUS_WAIT_FOR_USER_CONFIRM');
    } else if (!!subdomain && purchaseClicked && this.props.transactionBroadcasted) {
      className = 'help-block is-semivalid';
      icon = <Spinner />;
      markup = translate('ETHSIMPLE_STATUS_WAIT_FOR_MINE');
    } else if (
      !purchaseClicked &&
      !isAvailableDomain &&
      ownedByThisAddress &&
      !!req &&
      !!req.data
    ) {
      className = 'help-block is-valid';
      markup = translate('ETHSIMPLE_STATUS_SUBDOMAIN_OWNED_BY_USER', {
        $domain: (req.data as IBaseSubdomainRequest).name + constants.tld
      });
    }

    return (
      <React.Fragment>
        <span className={className}>
          {icon}
          {markup}
          {refreshIcon}
        </span>
      </React.Fragment>
    );
  };

  private buildTxData = () => {
    const { address, subdomain } = this.state;
    const inputs = {
      _node: constants.esFullDomainNamehash,
      _label: bufferToHex(sha3(subdomain)),
      _newNode: getNameHash(subdomain + constants.esFullDomain),
      _resolver: constants.publicResolverAddr,
      _owner: address,
      _resolvedAddress: address,
      _contentHash: constants.emptyContentHash
    } as any;
    const encodedInputData = this.state.ethSimpleSubdomainRegistrarInstance.purchaseSubdomain.encodeInput(
      Object.keys(inputs).reduce((accu, key) => ({ ...accu, [key]: inputs[key] }), {})
    );
    return encodedInputData;
  };

  private getESContractAddress = () => {
    return !this.props.networkConfig.isTestnet
      ? constants.subdomainRegistrarAddr.mainnet
      : constants.subdomainRegistrarAddr.ropsten;
  };

  private updateTxFields = () => {
    if (this.state.subdomain.length > 0) {
      const ethSimpleSubdomainRegistrarAddr = this.getESContractAddress();
      this.props.setToField({
        raw: ethSimpleSubdomainRegistrarAddr,
        value: Address(ethSimpleSubdomainRegistrarAddr)
      });
      this.props.setValueField({
        raw: constants.subdomainPriceETH,
        value: Wei(constants.subdomainPriceWei)
      });
      this.props.inputData(this.buildTxData());
      this.props.inputGasLimit(constants.purchaseSubdomainGasLimit);
    }
  };

  private purchaseSubdomain = (ev: React.FormEvent<HTMLElement>) => {
    ev.preventDefault();
    this.setState(
      {
        purchaseClicked: true,
        initialPollRequested: false
      },
      () => {
        this.updateTxFields();
      }
    );
  };

  private checkNetworkFields = () => {
    const { txNetworkFields } = this.props;
    const success = 'SUCCESS';
    if (
      txNetworkFields.gasEstimationStatus === success &&
      txNetworkFields.getNonceStatus === success
    ) {
      return true;
    }
    return false;
  };

  private checkTxFields = () => {
    const txFields = getTransactionFields(this.props.transaction);
    if (
      this.props.toChecksumAddress(txFields.to) === this.getESContractAddress() &&
      txFields.data === this.buildTxData()
    ) {
      return true;
    }
    return false;
  };

  private purchaseComplete = () => {
    const { subdomain } = this.state;
    this.props.subdomainPurchased(subdomain + constants.esFullDomain);
    this.handleNotifications();
    this.setState(
      {
        purchaseClicked: false
      },
      () => {
        this.refreshDomainResolution();
        this.props.resetTransactionRequested();
        this.props.getNonceRequested();
      }
    );
  };

  private refreshDomainResolution = () => {
    const { subdomain } = this.state;
    this.props.resolveDomainRequested(
      subdomain + constants.esDomain,
      this.props.networkConfig.isTestnet,
      true
    );
  };

  private handleNotifications = () => {
    this.closeTxBroadcastedNotification();
    this.showTxConfirmedNotification();
  };

  private closeTxBroadcastedNotification = () => {
    const { notifications, currentTransaction } = this.props;
    for (let i = 0; i < notifications.length; i++) {
      const notif = notifications[i];
      if (
        !!notif.componentConfig &&
        !!currentTransaction &&
        notif.componentConfig.txHash === currentTransaction.broadcastedHash
      ) {
        this.props.closeNotification(notif);
        break;
      }
    }
  };

  private showTxConfirmedNotification = () => {
    const { subdomain } = this.state;
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
    if (closedByUser) {
      this.props.resetTransactionRequested();
    }
  };

  private pollForHash = () => {
    setTimeout(this.getTxStatus, 10000);
  };

  private getTxStatus = () => {
    this.setState({ pollTimeout: false }, () => {
      const { currentTransaction } = this.props;
      if (
        this.state.purchaseClicked &&
        !!currentTransaction &&
        !!currentTransaction.broadcastedHash
      ) {
        this.props.fetchTransactionData(currentTransaction.broadcastedHash);
      }
    });
  };
}

function mapStateToProps(state: AppState): StateProps {
  return {
    txNetworkFields: state.transaction.network,
    domainRequests: state.ens.domainRequests,
    notifications: state.notifications,
    txState: state.transactions.txData,
    isResolving: ensSelectors.getResolvingDomain(state),
    networkConfig: configSelectors.getNetworkConfig(state),
    toChecksumAddress: configSelectors.getChecksumAddressFn(state),
    ...derivedSelectors.getTransaction(state),
    networkRequestPending: transactionNetworkSelectors.isNetworkRequestPending(state),
    validGasLimit: transactionSelectors.isValidGasLimit(state),
    currentTransaction: transactionSelectors.getCurrentTransactionStatus(state),
    transactionBroadcasted: transactionSelectors.currentTransactionBroadcasted(state),
    signaturePending: derivedSelectors.signaturePending(state).isSignaturePending,
    signedTx:
      !!transactionSignSelectors.getSignedTx(state) || !!transactionSignSelectors.getWeb3Tx(state)
  };
}

const mapDispatchToProps: DispatchProps = {
  showNotification: notificationsActions.showNotification,
  closeNotification: notificationsActions.closeNotification,
  resolveDomainRequested: ensActions.resolveDomainRequested,
  setToField: transactionFieldsActions.setToField,
  setValueField: transactionFieldsActions.setValueField,
  inputData: transactionFieldsActions.inputData,
  inputGasLimit: transactionFieldsActions.inputGasLimit,
  getNonceRequested: transactionNetworkActions.getNonceRequested,
  resetTransactionRequested: transactionFieldsActions.resetTransactionRequested,
  signTransactionRequested: transactionSignActions.signTransactionRequested,
  fetchTransactionData: transactionsActions.fetchTransactionData
};

export default connect(mapStateToProps, mapDispatchToProps)(ETHSimpleClass);
