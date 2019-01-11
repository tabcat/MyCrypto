import React from 'react';
import { connect } from 'react-redux';
import { sha3, bufferToHex } from 'ethereumjs-util';
import EthTx from 'ethereumjs-tx';
import BN from 'bn.js';

import { translate, translateRaw } from 'translations';
import { TransactionState, TransactionReceipt } from 'types/transactions';
import { AppState } from 'features/reducers';
import { ensActions, ensSelectors } from 'features/ens';
import { gasSelectors } from 'features/gas';
import { configSelectors } from 'features/config';
import { notificationsActions } from 'features/notifications';
import * as derivedSelectors from 'features/selectors';
import {
  transactionFieldsSelectors,
  transactionFieldsActions,
  transactionNetworkActions,
  transactionSelectors,
  transactionSignSelectors,
  transactionBroadcastTypes,
  transactionNetworkSelectors,
  transactionSignActions
} from 'features/transaction';
import { transactionsActions } from 'features/transactions';
import { walletSelectors, walletActions } from 'features/wallet';
import { IWallet } from 'libs/wallet';
import { isValidENSAddress } from 'libs/validators';
import { getNameHash, NameState, IBaseSubdomainRequest } from 'libs/ens';
import Contract from 'libs/contracts';
import { Address, Wei, toWei, handleValues } from 'libs/units';
import { getTransactionFields } from 'libs/transaction/utils/ether';
import { Input, Spinner } from 'components/ui';
import { ConfirmationModal } from 'components/ConfirmationModal';
import './ETHSimple.scss';
const constants = require('./ETHSimpleConstants.json');

interface StateProps {
  domainRequests: AppState['ens']['domainRequests'];
  txNetworkState: AppState['transaction']['network'];
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
  etherBalance: Wei | null;
  gasEstimates: AppState['gas']['estimates'];
  gasPrice: AppState['transaction']['fields']['gasPrice'];
}

interface DispatchProps {
  resolveDomainRequested: ensActions.TResolveDomainRequested;
  showNotification: notificationsActions.TShowNotification;
  closeNotification: notificationsActions.TCloseNotification;
  setToField: transactionFieldsActions.TSetToField;
  setValueField: transactionFieldsActions.TSetValueField;
  inputData: transactionFieldsActions.TInputData;
  inputGasLimit: transactionFieldsActions.TInputGasLimit;
  setGasPriceField: transactionFieldsActions.TSetGasPriceField;
  getNonceRequested: transactionNetworkActions.TGetNonceRequested;
  resetTransactionRequested: transactionFieldsActions.TResetTransactionRequested;
  signTransactionRequested: transactionSignActions.TSignTransactionRequested;
  fetchTransactionData: transactionsActions.TFetchTransactionData;
  refreshAccountBalance: walletActions.TRefreshAccountBalance;
}

interface OwnProps {
  wallet: IWallet;
  subdomainPurchased(label: string): void;
}

type Props = StateProps & DispatchProps & OwnProps;

interface State {
  ethSimpleSubdomainRegistrarInstance: Contract;
  subdomain: string;
  address: string;
  isValidDomain: boolean;
  isFocused: boolean;
  isLoading: boolean;
  purchaseButtonClicked: boolean;
  initialPollRequested: boolean;
  pollTimeout: boolean;
  showModal: boolean;
  domainRequest: IBaseSubdomainRequest | null;
}

class ETHSimpleClass extends React.Component<Props, State> {
  public state = {
    ethSimpleSubdomainRegistrarInstance: new Contract(constants.subdomainRegistrarABI),
    subdomain: '',
    address: '',
    isFocused: false,
    isValidDomain: false,
    isLoading: false,
    purchaseButtonClicked: false,
    initialPollRequested: false,
    pollTimeout: false,
    showModal: false,
    domainRequest: null
  };

  public render() {
    const description = this.generateDescription();
    const subdomainInputField = this.generateSubdomainInputField();
    const purchaseButton = this.generatePurchaseButton();
    const statusLabel = this.state.subdomain.length > 0 ? this.generateStatusLabel() : null;
    const modal = this.generateModal();
    const esLogoButton = this.generateESLogoButton();
    const component = constants.supportedNetworks.includes(this.props.networkConfig.id) ? (
      <div>
        <form className="ETHSimpleInput" onSubmit={this.purchaseSubdomain}>
          {subdomainInputField}
          {purchaseButton}
        </form>
        {statusLabel}
        {modal}
      </div>
    ) : null;

    return (
      <div className="ETHSimple">
        <h5 className="ETHSimple-title">{translate('ETHSIMPLE_TITLE')}</h5>
        <div className="ETHSimple-description">{description}</div>
        {component}
        {esLogoButton}
      </div>
    );
  }

  public componentDidMount() {
    this.setAddress();
  }

  public componentDidUpdate(prevProps: Props) {
    const {
      domainRequests,
      txState,
      txNetworkState,
      currentTransaction,
      wallet,
      networkConfig
    } = this.props;
    const { subdomain, pollTimeout, purchaseButtonClicked } = this.state;
    if (wallet !== prevProps.wallet || networkConfig !== prevProps.networkConfig) {
      this.setAddress();
    }
    if (domainRequests !== prevProps.domainRequests) {
      if (this.domainValidResolvedWithData()) {
        const domainToCheck = subdomain + constants.esDomain;
        const domainRequest = domainRequests[domainToCheck].data as IBaseSubdomainRequest;
        this.setState({ domainRequest });
      }
    }
    if (purchaseButtonClicked) {
      if (txNetworkState !== prevProps.txNetworkState) {
        if (this.signTxIntended()) {
          if (this.txFieldsValid()) {
            setTimeout(this.signTx, 500);
          } else {
            this.setTxFields();
          }
        }
      }
      if (currentTransaction !== prevProps.currentTransaction) {
        if (this.txBroadcastSuccessful()) {
          this.setState({ initialPollRequested: true });
          this.pollForTxHash();
        } else if (this.txBroadcastFailed(prevProps)) {
          this.setState({
            purchaseButtonClicked: false
          });
        }
      }
      if (txState !== prevProps.txState) {
        if (this.txConfirmed()) {
          this.purchaseComplete();
        } else if (!pollTimeout) {
          this.setState({ pollTimeout: true }, () => {
            this.pollForTxHash();
          });
        }
      }
    }
  }

  private setAddress = () => {
    const address = this.props.toChecksumAddress(this.props.wallet.getAddressString());
    this.setState({ address });
  };

  private setGas = () => {
    const { gasEstimates } = this.props;
    if (!!gasEstimates) {
      const gasPrice = gasEstimates.fast.toString();
      this.props.setGasPriceField({ raw: gasPrice, value: toWei(gasPrice, 9) });
    }
  };

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const { esFullDomain, esDomain } = constants;
    const subdomain = event.currentTarget.value.trim().toLowerCase();
    const purchaseButtonClicked = false;
    const subdomainEntered = subdomain.length > 0;
    const isValidDomain = subdomainEntered ? isValidENSAddress(subdomain + esFullDomain) : false;
    const domainRequest = subdomainEntered ? this.state.domainRequest : null;
    this.setState(
      {
        subdomain,
        isValidDomain,
        purchaseButtonClicked,
        domainRequest
      },
      () => {
        if (isValidDomain) {
          this.props.resolveDomainRequested(
            subdomain + esDomain,
            this.props.networkConfig.isTestnet
          );
        }
        if (!subdomainEntered) {
          this.props.resetTransactionRequested();
          this.setGas();
        }
      }
    );
  };

  private onFocus = () => {
    this.props.resetTransactionRequested();
    this.props.getNonceRequested();
    this.setGas();
    this.setState({ isFocused: true });
  };

  private onBlur = () => this.setState({ isFocused: false });

  private generateDescription = (): React.ReactElement<any> => {
    const { address, subdomain } = this.state;
    const { networkConfig } = this.props;
    const supportedNetwork = constants.supportedNetworks.includes(networkConfig.id);
    if (supportedNetwork) {
      const addressToDisplay =
        address.length > 0 ? address : translateRaw('ETHSIMPLE_DESC_DEFAULT_NO_ADDR');
      const nameToDisplay =
        subdomain.length > 0
          ? subdomain + constants.esFullDomain
          : constants.placeholderDomain + constants.esFullDomain;
      const cutoff = subdomain.length < 5 && subdomain.length > 0 ? 0 : 15;
      return translate('ETHSIMPLE_DESC', {
        $subdomain: nameToDisplay,
        $addr:
          addressToDisplay.substring(0, addressToDisplay.length - cutoff) +
          (cutoff > 0 ? '...' : '')
      });
    } else {
      return translate('ETHSIMPLE_UNSUPPORTED_NETWORK', {
        $network: networkConfig.id
      });
    }
  };

  private generateSubdomainInputField = (): React.ReactElement<any> => {
    const { isLoading, isValidDomain, subdomain } = this.state;
    const { placeholderDomain, esFullDomain } = constants;
    return (
      <div className="input-group-wrapper">
        <label className="input-group input-group-inline">
          <Input
            className="ETHSimple-name border-rad-right-0"
            value={subdomain}
            isValid={isValidDomain}
            type="text"
            placeholder={placeholderDomain}
            spellCheck={false}
            onChange={this.onChange}
            onFocus={this.onFocus}
            onBlur={this.onBlur}
            disabled={isLoading}
          />
          <span className="ETHSimple-name input-group-addon">{esFullDomain}</span>
        </label>
      </div>
    );
  };

  private generatePurchaseButton = (): React.ReactElement<any> => {
    const { purchaseButtonClicked, subdomain, isValidDomain, address } = this.state;
    const { isResolving, networkRequestPending, domainRequests } = this.props;
    const domainToCheck = subdomain + constants.esDomain;
    const req = domainRequests[domainToCheck];
    const isAvailableDomain =
      !!req && !!req.data ? (req.data as IBaseSubdomainRequest).mode === NameState.Open : false;
    const ownedByThisAddress =
      !!req && !!req.data ? (req.data as IBaseSubdomainRequest).ownerAddress === address : false;
    const purchaseDisabled =
      !isValidDomain ||
      isResolving ||
      purchaseButtonClicked ||
      subdomain.length < 1 ||
      networkRequestPending ||
      !isAvailableDomain ||
      ownedByThisAddress ||
      this.insufficientEtherBalance();
    return (
      <button
        className="ETHSimple-button btn btn-primary btn-block"
        disabled={purchaseDisabled}
        onClick={this.purchaseSubdomain}
      >
        {translate('ETHSIMPLE_ACTION', { $domainEthPrice: constants.subdomainPriceETH })}
      </button>
    );
  };

  private generateStatusLabel = (): React.ReactElement<any> => {
    const { subdomain, isValidDomain, purchaseButtonClicked, address } = this.state;
    const { isResolving, domainRequests } = this.props;
    const domainToCheck = subdomain + constants.esDomain;
    const req = domainRequests[domainToCheck];
    const requestDataValid = !!req && !!req.data;
    const isAvailableDomain = requestDataValid
      ? (req.data as IBaseSubdomainRequest).mode === NameState.Open
      : false;
    const ownedByThisAddress = requestDataValid
      ? (req.data as IBaseSubdomainRequest).ownerAddress === address
      : false;
    const validResolvedDomain = isValidDomain && !isResolving && requestDataValid;
    const spinnerIcon = <Spinner />;
    const checkIcon = <i className="fa fa-check" />;
    const xIcon = <i className="fa fa-remove" />;
    const refreshIcon = <i className="fa fa-refresh" />;
    const validClass = 'ETHSimple-status help-block is-valid';
    const warningClass = 'ETHSimple-status help-block is-semivalid';
    const invalidClass = 'ETHSimple-status help-block is-invalid';
    const refreshButton = (
      <button className="ETHSimple-section-refresh" onClick={this.refreshDomainResolution}>
        {refreshIcon}
      </button>
    );
    const domainName = { $domain: subdomain + constants.esFullDomain };
    let className = '';
    let icon = null;
    let label = null;
    let button = null;

    if (!validResolvedDomain) {
      if (!isValidDomain) {
        className = invalidClass;
        label = translate('ENS_SUBDOMAIN_INVALID_INPUT');
      } else {
        className = warningClass;
        icon = spinnerIcon;
        label = translate('ETHSIMPLE_STATUS_RESOLVING_SUBDOMAIN', domainName);
      }
    } else {
      if (!purchaseButtonClicked) {
        if (isAvailableDomain) {
          button = refreshButton;
          if (this.insufficientEtherBalance()) {
            className = warningClass;
            label = translate('ETHSIMPLE_STATUS_SUBDOMAIN_AVAILABLE_UNABLE', domainName);
          } else {
            className = validClass;
            icon = checkIcon;
            label = translate('ETHSIMPLE_STATUS_SUBDOMAIN_AVAILABLE', domainName);
          }
        } else {
          if (ownedByThisAddress) {
            className = validClass;
            label = translate('ETHSIMPLE_STATUS_SUBDOMAIN_OWNED_BY_USER', domainName);
          } else {
            className = invalidClass;
            icon = xIcon;
            label = translate('ETHSIMPLE_STATUS_SUBDOMAIN_UNAVAILABLE', domainName);
          }
        }
      } else {
        className = warningClass;
        icon = spinnerIcon;
        if (!this.props.transactionBroadcasted) {
          label = translate('ETHSIMPLE_STATUS_WAIT_FOR_USER_CONFIRM');
        } else {
          label = translate('ETHSIMPLE_STATUS_WAIT_FOR_MINE');
        }
      }
    }
    return (
      <div className={className}>
        {icon}
        {label}
        {button}
      </div>
    );
  };

  private generateModal = (): React.ReactElement<any> => {
    const { signaturePending, signedTx } = this.props;
    return (
      <ConfirmationModal
        isOpen={!signaturePending && signedTx && this.state.showModal}
        onClose={this.cancelModal}
      />
    );
  };

  private generateESLogoButton = (): React.ReactElement<any> => {
    return (
      <div className="row">
        <div className="col-xs-12">
          <a
            className="ETHSimple-logo"
            href={constants.esURL}
            target="_blank"
            rel="noopener noreferrer"
          />
        </div>
      </div>
    );
  };

  private insufficientEtherBalance = (): boolean => {
    const { subdomainPriceWei, purchaseSubdomainGasLimit } = constants;
    const { gasPrice, etherBalance } = this.props;
    const txCost = Wei(subdomainPriceWei).add(
      gasPrice.value.mul(handleValues(purchaseSubdomainGasLimit))
    );
    if (!!etherBalance && txCost.gt(etherBalance)) {
      return true;
    }
    return false;
  };

  private domainValidResolvedWithData = (): boolean => {
    const { subdomain, isValidDomain } = this.state;
    const { domainRequests, isResolving } = this.props;
    const domainToCheck = subdomain + constants.esDomain;
    const req = domainRequests[domainToCheck];
    const resolveCompleteAndValid =
      !isResolving &&
      isValidDomain &&
      !!req &&
      !req.error &&
      !!(req.data as IBaseSubdomainRequest) &&
      (req.data as IBaseSubdomainRequest).name === domainToCheck;
    if (resolveCompleteAndValid && !!req.data) {
      return true;
    }
    return false;
  };

  private purchaseSubdomain = (ev: React.FormEvent<HTMLElement>) => {
    ev.preventDefault();
    this.setState(
      {
        purchaseButtonClicked: true,
        initialPollRequested: false
      },
      () => {
        this.setTxFields();
      }
    );
  };

  private getTxAddress = (): string => {
    const { subdomainRegistrarAddr } = constants;
    return this.props.networkConfig.isTestnet
      ? subdomainRegistrarAddr.ropsten
      : subdomainRegistrarAddr.mainnet;
  };

  private getTxData = (): string => {
    const { address, subdomain, ethSimpleSubdomainRegistrarInstance } = this.state;
    const { esFullDomainNamehash, esFullDomain, publicResolverAddr, emptyContentHash } = constants;
    const inputs = {
      _node: esFullDomainNamehash,
      _label: bufferToHex(sha3(subdomain)),
      _newNode: getNameHash(subdomain + esFullDomain),
      _resolver: publicResolverAddr,
      _owner: address,
      _resolvedAddress: address,
      _contentHash: emptyContentHash
    } as any;
    return ethSimpleSubdomainRegistrarInstance.purchaseSubdomain.encodeInput(
      Object.keys(inputs).reduce((accu, key) => ({ ...accu, [key]: inputs[key] }), {})
    );
  };

  private getTxValue = (): string => {
    const { subdomainPriceWei } = constants;
    return bufferToHex(new BN(subdomainPriceWei));
  };

  private setTxFields = () => {
    const { txNetworkState, transaction } = this.props;
    const { subdomainPriceETH, subdomainPriceWei, purchaseSubdomainGasLimit } = constants;
    const success = 'SUCCESS';
    const txFields = getTransactionFields(transaction);
    const txAddress = this.getTxAddress();
    const txData = this.getTxData();
    const txValue = this.getTxValue();
    if (this.props.toChecksumAddress(txFields.to) !== txAddress) {
      this.props.setToField({
        raw: txAddress,
        value: Address(txAddress)
      });
    }
    if (txFields.data !== txData) {
      this.props.inputData(txData);
    }
    if (txFields.value !== txValue) {
      this.props.setValueField({
        raw: subdomainPriceETH,
        value: Wei(subdomainPriceWei)
      });
    }
    if (txNetworkState.gasEstimationStatus !== success) {
      this.props.inputGasLimit(purchaseSubdomainGasLimit);
    }
    if (txNetworkState.getNonceStatus !== success) {
      this.props.getNonceRequested();
    }
  };

  private signTxIntended = (): boolean => {
    const { signaturePending, networkRequestPending } = this.props;
    if (this.state.purchaseButtonClicked && !signaturePending && !networkRequestPending) {
      return true;
    }
    return false;
  };

  private txFieldsValid = (): boolean => {
    const { isFullTransaction, validGasLimit, transaction, txNetworkState } = this.props;
    const txFields = getTransactionFields(transaction);
    const txAddress = this.getTxAddress();
    const txData = this.getTxData();
    const txValue = this.getTxValue();
    const success = 'SUCCESS';
    if (
      this.props.toChecksumAddress(txFields.to) === txAddress &&
      txFields.data === txData &&
      txFields.value === txValue &&
      txNetworkState.gasEstimationStatus === success &&
      validGasLimit &&
      txNetworkState.getNonceStatus === success &&
      isFullTransaction
    ) {
      return true;
    }
    return false;
  };

  private signTx = () => {
    if (this.txFieldsValid()) {
      this.props.signTransactionRequested(this.props.transaction);
      this.openModal();
    }
  };

  private txBroadcastSuccessful = (): boolean => {
    const { purchaseButtonClicked, initialPollRequested } = this.state;
    const { currentTransaction } = this.props;
    if (
      purchaseButtonClicked &&
      !initialPollRequested &&
      !!currentTransaction &&
      currentTransaction.broadcastSuccessful
    ) {
      return true;
    }
    return false;
  };

  private txBroadcastFailed = (prevProps: Props): boolean => {
    const { currentTransaction } = this.props;
    if (
      this.state.purchaseButtonClicked &&
      !!currentTransaction &&
      !!prevProps.currentTransaction &&
      !prevProps.currentTransaction.broadcastSuccessful &&
      prevProps.currentTransaction.isBroadcasting &&
      !currentTransaction.broadcastSuccessful &&
      !currentTransaction.isBroadcasting
    ) {
      return true;
    }
    return false;
  };

  private txConfirmed = (): boolean => {
    const { purchaseButtonClicked, initialPollRequested } = this.state;
    const { currentTransaction, txState } = this.props;
    if (
      purchaseButtonClicked &&
      initialPollRequested &&
      !!currentTransaction &&
      !!currentTransaction.broadcastedHash &&
      !!txState[currentTransaction.broadcastedHash].receipt &&
      !!(txState[currentTransaction.broadcastedHash].receipt as TransactionReceipt).status &&
      (txState[currentTransaction.broadcastedHash].receipt as TransactionReceipt).status === 1
    ) {
      return true;
    }
    return false;
  };

  private purchaseComplete = () => {
    this.props.subdomainPurchased(this.state.subdomain + constants.esFullDomain);
    this.closeTxBroadcastedNotification();
    this.showTxConfirmedNotification();
    this.setState(
      {
        purchaseButtonClicked: false
      },
      () => {
        this.props.resetTransactionRequested();
        this.props.getNonceRequested();
        this.setGas();
        this.props.refreshAccountBalance();
        setTimeout(this.refreshDomainResolution, 2500);
      }
    );
  };

  private refreshDomainResolution = () => {
    this.props.resolveDomainRequested(
      this.state.subdomain + constants.esDomain,
      this.props.networkConfig.isTestnet,
      true
    );
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
    this.props.showNotification(
      'success',
      translateRaw('ETHSIMPLE_SUBDOMAIN_TX_CONFIRMED_MODAL_DESC', {
        $domain: this.state.subdomain + constants.esFullDomain
      }),
      10000
    );
  };

  private openModal = () => {
    const { currentTransaction } = this.props;
    if (
      !!currentTransaction &&
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

  private cancelModal = () => this.closeModal(true);

  private closeModal = (closedByUser: boolean) => {
    this.setState({
      showModal: false,
      purchaseButtonClicked: !closedByUser
    });
  };

  private pollForTxHash = () => setTimeout(this.getTxStatus, 10000);

  private getTxStatus = () => {
    this.setState({ pollTimeout: false }, () => {
      const { currentTransaction } = this.props;
      if (
        this.state.purchaseButtonClicked &&
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
    domainRequests: state.ens.domainRequests,
    txNetworkState: state.transaction.network,
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
      !!transactionSignSelectors.getSignedTx(state) || !!transactionSignSelectors.getWeb3Tx(state),
    etherBalance: walletSelectors.getEtherBalance(state),
    gasEstimates: gasSelectors.getEstimates(state),
    gasPrice: transactionFieldsSelectors.getGasPrice(state)
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
  setGasPriceField: transactionFieldsActions.setGasPriceField,
  getNonceRequested: transactionNetworkActions.getNonceRequested,
  resetTransactionRequested: transactionFieldsActions.resetTransactionRequested,
  signTransactionRequested: transactionSignActions.signTransactionRequested,
  fetchTransactionData: transactionsActions.fetchTransactionData,
  refreshAccountBalance: walletActions.refreshAccountBalance
};

export default connect(mapStateToProps, mapDispatchToProps)(ETHSimpleClass);
