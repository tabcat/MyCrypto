import React from 'react';
import { connect } from 'react-redux';
import { sha3, bufferToHex, unpad, addHexPrefix } from 'ethereumjs-util';
import EthTx from 'ethereumjs-tx';
import BN from 'bn.js';

import { translate, translateRaw } from 'translations';
import { TransactionState, TransactionReceipt } from 'types/transactions';
import { AppState } from 'features/reducers';
import { ensActions, ensSelectors } from 'features/ens';
import { gasSelectors } from 'features/gas';
import { configSelectors, configMetaActions } from 'features/config';
import { notificationsActions } from 'features/notifications';
import * as derivedSelectors from 'features/selectors';
import {
  transactionFieldsSelectors,
  transactionFieldsActions,
  transactionNetworkActions,
  transactionSelectors,
  transactionSignSelectors,
  transactionBroadcastTypes,
  transactionSignActions
} from 'features/transaction';
import { transactionsActions } from 'features/transactions';
import { walletSelectors, walletActions } from 'features/wallet';
import { IWallet } from 'libs/wallet';
import { isValidENSAddress } from 'libs/validators';
import { normalise, getNameHash, NameState, IBaseSubdomainRequest } from 'libs/ens';
import Contract from 'libs/contracts';
import { Address, Wei, handleValues, gasPriceToBase } from 'libs/units';
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
  currentTransaction: false | transactionBroadcastTypes.ITransactionStatus | null;
  transaction: EthTx;
  etherBalance: Wei | null;
  gasEstimates: AppState['gas']['estimates'];
  gasPrice: AppState['transaction']['fields']['gasPrice'];
  autoGasLimit: AppState['config']['meta']['autoGasLimit'];
}

interface DispatchProps {
  resolveDomainRequested: ensActions.TResolveDomainRequested;
  showNotification: notificationsActions.TShowNotification;
  closeNotification: notificationsActions.TCloseNotification;
  setToField: transactionFieldsActions.TSetToField;
  setValueField: transactionFieldsActions.TSetValueField;
  inputData: transactionFieldsActions.TInputData;
  inputGasLimit: transactionFieldsActions.TInputGasLimit;
  inputGasPrice: transactionFieldsActions.TInputGasPrice;
  getNonceRequested: transactionNetworkActions.TGetNonceRequested;
  resetTransactionRequested: transactionFieldsActions.TResetTransactionRequested;
  signTransactionRequested: transactionSignActions.TSignTransactionRequested;
  fetchTransactionData: transactionsActions.TFetchTransactionData;
  refreshAccountBalance: walletActions.TRefreshAccountBalance;
  toggleAutoGasLimit: configMetaActions.TToggleAutoGasLimit;
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
  successStatus: string;
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
    domainRequest: null,
    successStatus: 'SUCCESS'
  };

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
        if (this.signTxIntended() && this.txFieldsValid()) {
          this.signTx();
        }
      }
      if (currentTransaction !== prevProps.currentTransaction) {
        if (this.txBroadcastSuccessful()) {
          this.setState({ initialPollRequested: true });
          this.pollForTxHash();
        } else if (this.txBroadcastFailed(prevProps)) {
          this.setState({ purchaseButtonClicked: false });
        }
      }
      if (txState !== prevProps.txState) {
        if (this.txConfirmed()) {
          this.purchaseComplete();
        } else if (!pollTimeout) {
          this.setState({ pollTimeout: true }, () => this.pollForTxHash());
        }
      }
    }
  }

  private setAddress = () => {
    const address = this.props.toChecksumAddress(this.props.wallet.getAddressString());
    this.setState({ address });
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

  private generateDescription = (): React.ReactElement<any> => {
    const { address, subdomain } = this.state;
    const { networkConfig } = this.props;
    const { supportedNetworks, esFullDomain, placeholderDomain } = constants;
    const supportedNetwork = supportedNetworks.includes(networkConfig.id);
    if (supportedNetwork) {
      const addressToDisplay =
        address.length > 0 ? address : translateRaw('ETHSIMPLE_DESC_DEFAULT_NO_ADDR');
      const nameToDisplay =
        subdomain.length > 0 ? subdomain + esFullDomain : placeholderDomain + esFullDomain;
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
            className="ETHSimple-name ETHSimple-name-input border-rad-right-0"
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
    const { isResolving, domainRequests } = this.props;
    const { esDomain, subdomainPriceETH } = constants;
    const domainToCheck = subdomain + esDomain;
    const req = domainRequests[domainToCheck];
    const requestDataValid = !!req && !!req.data;
    const isAvailableDomain = requestDataValid
      ? (req.data as IBaseSubdomainRequest).mode === NameState.Open
      : false;
    const ownedByThisAddress = requestDataValid
      ? (req.data as IBaseSubdomainRequest).ownerAddress === address
      : false;
    const purchaseDisabled =
      !isValidDomain ||
      (isResolving && !requestDataValid) ||
      purchaseButtonClicked ||
      subdomain.length < 1 ||
      !isAvailableDomain ||
      ownedByThisAddress ||
      this.insufficientEtherBalance();
    return (
      <button
        className="ETHSimple-button btn btn-primary btn-block"
        disabled={purchaseDisabled}
        onClick={this.purchaseSubdomain}
      >
        {translate('ETHSIMPLE_ACTION', { $domainEthPrice: subdomainPriceETH })}
      </button>
    );
  };

  private generateStatusLabel = (): React.ReactElement<any> => {
    const { subdomain, isValidDomain, purchaseButtonClicked, address, successStatus } = this.state;
    const { isResolving, domainRequests } = this.props;
    const { esDomain, esFullDomain } = constants;
    const domainToCheck = subdomain + esDomain;
    const req = domainRequests[domainToCheck];
    const requestDataValid = !!req && !!req.data;
    const isAvailableDomain = requestDataValid
      ? (req.data as IBaseSubdomainRequest).mode === NameState.Open
      : false;
    const ownedByThisAddress = requestDataValid
      ? (req.data as IBaseSubdomainRequest).ownerAddress === address
      : false;
    const isResolvingCurrentDomain = !requestDataValid && isResolving;
    const isRefreshingCurrentDomain =
      isResolving && requestDataValid && req.state !== successStatus;
    const spinnerIcon = <Spinner />;
    const checkIcon = <i className="fa fa-check" />;
    const xIcon = <i className="fa fa-remove" />;
    const refreshIcon = <i className="fa fa-refresh" />;
    const divBaseClass = 'ETHSimple-status help-block is-';
    const validClass = divBaseClass + 'valid';
    const warningClass = divBaseClass + 'semivalid';
    const invalidClass = divBaseClass + 'invalid';
    const refreshButton = (
      <button className="ETHSimple-section-refresh" onClick={this.refreshDomainResolution}>
        {refreshIcon}
      </button>
    );
    const domainName = { $domain: subdomain + esFullDomain };
    let className = '';
    let icon = null;
    let label = null;
    let button = null;

    if (purchaseButtonClicked) {
      className = warningClass;
      icon = spinnerIcon;
      label = this.props.transactionBroadcasted
        ? translate('ETHSIMPLE_STATUS_WAIT_FOR_MINE')
        : translate('ETHSIMPLE_STATUS_WAIT_FOR_USER_CONFIRM');
    } else {
      if (!isValidDomain) {
        className = invalidClass;
        label = translate('ENS_SUBDOMAIN_INVALID_INPUT');
      } else if (isResolvingCurrentDomain || isRefreshingCurrentDomain) {
        className = warningClass;
        icon = spinnerIcon;
        label = translate('ETHSIMPLE_STATUS_RESOLVING_SUBDOMAIN', domainName);
      } else if (requestDataValid) {
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

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const { esFullDomain, esDomain } = constants;
    const subdomain = normalise(event.currentTarget.value.trim().toLowerCase());
    const subdomainEntered = subdomain.length > 0;
    const isValidDomain = subdomainEntered ? isValidENSAddress(subdomain + esFullDomain) : false;
    const domainRequest = subdomainEntered ? this.state.domainRequest : null;
    this.setState(
      {
        subdomain,
        isValidDomain,
        purchaseButtonClicked: false,
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
    this.setGas();
    this.setState({ isFocused: true });
    if (this.props.autoGasLimit) {
      this.props.toggleAutoGasLimit();
    }
  };

  private onBlur = () => this.setState({ isFocused: false });

  private setGas = () => {
    const { gasEstimates } = this.props;
    if (!!gasEstimates) {
      this.props.inputGasPrice(gasEstimates.fast.toString());
    }
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
    if (
      !isResolving &&
      isValidDomain &&
      !!req &&
      !req.error &&
      !!req.data &&
      !!(req.data as IBaseSubdomainRequest) &&
      (req.data as IBaseSubdomainRequest).name === domainToCheck
    ) {
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
        if (this.txFieldsValid() && this.props.signedTx) {
          this.openModal();
        } else {
          this.setTxFields();
        }
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
    return bufferToHex(Wei(subdomainPriceWei));
  };

  private getTxGasPrice = (): string => {
    const { gasEstimates } = this.props;
    const { purchaseSubdomainGasPrice } = constants;
    return !!gasEstimates ? gasEstimates.fast.toString() : purchaseSubdomainGasPrice;
  };

  private getTxGasLimit = (): string => {
    const { purchaseSubdomainGasLimit } = constants;
    return bufferToHex(new BN(purchaseSubdomainGasLimit));
  };

  private setTxFields = () => {
    const { successStatus } = this.state;
    const { txNetworkState, transaction } = this.props;
    const { subdomainPriceETH, subdomainPriceWei } = constants;
    const txFields = getTransactionFields(transaction);
    const txAddress = this.getTxAddress();
    const txData = this.getTxData();
    const txValue = this.getTxValue();
    const txGasPrice = this.getTxGasPrice();
    const txGasLimit = this.getTxGasLimit();
    if (txFields.to !== txAddress) {
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
    if (txFields.gasPrice !== txGasPrice) {
      this.props.inputGasPrice(txGasPrice);
    }
    if (txFields.gasLimit !== txGasLimit) {
      this.props.inputGasLimit(txGasLimit);
    }
    if (txNetworkState.getNonceStatus !== successStatus) {
      this.props.getNonceRequested();
    }
  };

  private signTxIntended = (): boolean => {
    const { signaturePending, signedTx } = this.props;
    if (this.state.purchaseButtonClicked && !signaturePending && !signedTx) {
      return true;
    }
    return false;
  };

  private txFieldsValid = (): boolean => {
    const { successStatus } = this.state;
    const { isFullTransaction, transaction, txNetworkState } = this.props;
    const txFields = getTransactionFields(transaction);
    const txAddress = this.getTxAddress();
    const txData = this.getTxData();
    const txValue = this.getTxValue();
    const txGasPrice = this.cleanHexString(
      bufferToHex(gasPriceToBase(Number(this.getTxGasPrice())))
    );
    const txGasLimit = this.cleanHexString(this.getTxGasLimit());
    if (
      txFields.to === txAddress &&
      txFields.data === txData &&
      txFields.value === txValue &&
      txFields.gasPrice === txGasPrice &&
      txFields.gasLimit === txGasLimit &&
      txNetworkState.getNonceStatus === successStatus &&
      isFullTransaction
    ) {
      return true;
    }
    return false;
  };

  private cleanHexString = (input: string): string => {
    return addHexPrefix(unpad(input));
  };

  private signTx = () => {
    this.props.signTransactionRequested(this.props.transaction);
    this.openModal();
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
    this.setState({ purchaseButtonClicked: false }, () => {
      this.props.resetTransactionRequested();
      this.setGas();
      this.props.refreshAccountBalance();
      setTimeout(this.refreshDomainResolution, 3000);
    });
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
    this.setState(
      {
        showModal: false,
        purchaseButtonClicked: !closedByUser
      },
      () => {
        if (!this.props.autoGasLimit) {
          this.props.toggleAutoGasLimit();
        }
      }
    );
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
    currentTransaction: transactionSelectors.getCurrentTransactionStatus(state),
    transactionBroadcasted: transactionSelectors.currentTransactionBroadcasted(state),
    signaturePending: derivedSelectors.signaturePending(state).isSignaturePending,
    signedTx:
      !!transactionSignSelectors.getSignedTx(state) || !!transactionSignSelectors.getWeb3Tx(state),
    etherBalance: walletSelectors.getEtherBalance(state),
    gasEstimates: gasSelectors.getEstimates(state),
    gasPrice: transactionFieldsSelectors.getGasPrice(state),
    autoGasLimit: state.config.meta.autoGasLimit
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
  inputGasPrice: transactionFieldsActions.inputGasPrice,
  getNonceRequested: transactionNetworkActions.getNonceRequested,
  resetTransactionRequested: transactionFieldsActions.resetTransactionRequested,
  signTransactionRequested: transactionSignActions.signTransactionRequested,
  fetchTransactionData: transactionsActions.fetchTransactionData,
  refreshAccountBalance: walletActions.refreshAccountBalance,
  toggleAutoGasLimit: configMetaActions.toggleAutoGasLimit
};

export default connect(mapStateToProps, mapDispatchToProps)(ETHSimpleClass);
