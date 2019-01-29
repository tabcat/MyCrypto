import React from 'react';
import { connect } from 'react-redux';
import { sha3, bufferToHex, unpad, addHexPrefix } from 'ethereumjs-util';
import EthTx from 'ethereumjs-tx';
import BN from 'bn.js';

import { TransactionReceipt } from 'types/transactions';
import { AppState } from 'features/reducers';
import { ensActions, ensSelectors, ensDomainRequestsTypes } from 'features/ens';
import { gasSelectors } from 'features/gas';
import { configSelectors, configMetaActions } from 'features/config';
import { configMetaSelectors } from 'features/config/meta';
import { notificationsActions } from 'features/notifications';
import * as derivedSelectors from 'features/selectors';
import {
  transactionFieldsSelectors,
  transactionFieldsActions,
  transactionNetworkActions,
  transactionNetworkSelectors,
  transactionSelectors,
  transactionSignSelectors,
  transactionBroadcastTypes,
  transactionSignActions
} from 'features/transaction';
import { transactionNetworkTypes } from 'features/transaction/network';
import { transactionsActions, transactionsSelectors } from 'features/transactions';
import { walletSelectors, walletActions } from 'features/wallet';
import { IWallet } from 'libs/wallet';
import { normalise, getNameHash, NameState, IBaseSubdomainRequest } from 'libs/ens';
import Contract from 'libs/contracts';
import { Address, Wei, handleValues, gasPriceToBase, fromWei } from 'libs/units';
import { getTransactionFields } from 'libs/transaction/utils/ether';
import { Input, Spinner } from 'components/ui';
import { ConfirmationModal } from 'components/ConfirmationModal';
import { translate, translateRaw } from 'translations';
import './ETHSimple.scss';
const constants = require('./ETHSimpleConstants.json');

interface StateProps {
  domainRequests: AppState['ens']['domainRequests'];
  nonceStatus: AppState['transaction']['network']['getNonceStatus'];
  gasEstimation: AppState['transaction']['network']['gasEstimationStatus'];
  notifications: AppState['notifications'];
  isResolving: boolean | null;
  network: ReturnType<typeof configSelectors.getNetworkConfig>;
  checksum: ReturnType<typeof configSelectors.getChecksumAddressFn>;
  txDatas: AppState['transactions']['txData'];
  txBroadcasted: boolean | null;
  signaturePending: AppState['transaction']['sign']['pending'];
  signedTx: boolean;
  isFullTransaction: boolean;
  currentTxStatus: false | transactionBroadcastTypes.ITransactionStatus | null;
  transaction: EthTx;
  etherBalance: AppState['wallet']['balance']['wei'];
  gasEstimates: AppState['gas']['estimates'];
  gasPrice: AppState['transaction']['fields']['gasPrice'];
  autoGasLimit: AppState['config']['meta']['autoGasLimit'];
}

interface DispatchProps {
  resolveDomain: ensActions.TResolveDomainRequested;
  showNotification: notificationsActions.TShowNotification;
  closeNotification: notificationsActions.TCloseNotification;
  setToField: transactionFieldsActions.TSetToField;
  setValueField: transactionFieldsActions.TSetValueField;
  inputData: transactionFieldsActions.TInputData;
  inputGasLimit: transactionFieldsActions.TInputGasLimit;
  inputGasPrice: transactionFieldsActions.TInputGasPrice;
  getNonce: transactionNetworkActions.TGetNonceRequested;
  resetTx: transactionFieldsActions.TResetTransactionRequested;
  signTx: transactionSignActions.TSignTransactionRequested;
  fetchTxData: transactionsActions.TFetchTransactionData;
  refreshBalance: walletActions.TRefreshAccountBalance;
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
  purchaseButtonClicked: boolean;
  pollInitiated: boolean;
  pollTimeout: boolean;
  showModal: boolean;
  broadcastedHash: string;
  lastKeystrokeTime: number;
  resolutionDelay: number;
  isRetrieved: boolean;
  isAvailable: boolean;
  isOwnedBySelf: boolean;
}

class ETHSimpleClass extends React.Component<Props, State> {
  public state = {
    ethSimpleSubdomainRegistrarInstance: new Contract(constants.subdomainRegistrarABI),
    subdomain: '',
    address: '',
    purchaseButtonClicked: false,
    pollInitiated: false,
    pollTimeout: false,
    showModal: false,
    broadcastedHash: '',
    lastKeystrokeTime: Date.now(),
    resolutionDelay: 500,
    isRetrieved: false,
    isAvailable: false,
    isOwnedBySelf: false
  };

  public componentDidMount() {
    this.setAddress();
  }

  public componentDidUpdate(prevProps: Props) {
    const { txDatas, currentTxStatus, wallet, network, domainRequests, resolveDomain } = this.props;
    const { pollTimeout, purchaseButtonClicked, subdomain, address } = this.state;
    if (wallet !== prevProps.wallet || network !== prevProps.network) {
      this.setAddress();
    }
    if (domainRequests !== prevProps.domainRequests) {
      const req = domainRequests[subdomain + constants.esDomain];
      const isRetrieved = !!req && req.state === ensDomainRequestsTypes.RequestStates.success;
      const requestFailed = !!req && req.state === ensDomainRequestsTypes.RequestStates.failed;
      const isAvailable = isRetrieved
        ? (req.data as IBaseSubdomainRequest).mode === NameState.Open
        : false;
      const isOwnedBySelf = isRetrieved
        ? (req.data as IBaseSubdomainRequest).ownerAddress === address
        : false;
      this.setState({ isRetrieved, isAvailable, isOwnedBySelf });
      if (requestFailed && !!network.isTestnet) {
        resolveDomain(subdomain + constants.esDomain, network.isTestnet);
      }
    }
    if (purchaseButtonClicked) {
      if (this.signTxIntended() && this.txFieldsValid()) {
        this.signTx();
      }
      if (currentTxStatus !== prevProps.currentTxStatus) {
        if (this.txBroadcastSuccessful()) {
          this.setState({
            broadcastedHash: (currentTxStatus as any).broadcastedHash,
            pollInitiated: true
          });
          this.pollForTxReceipt();
        } else if (this.txBroadcastFailed(prevProps)) {
          this.setState({ purchaseButtonClicked: false });
        }
      }
      if (txDatas !== prevProps.txDatas) {
        if (this.txConfirmed()) {
          this.purchaseComplete();
        } else if (!pollTimeout) {
          this.setState({ pollTimeout: true }, () => this.pollForTxReceipt());
        }
      }
    }
  }

  public render() {
    const title = translate('ETHSIMPLE_TITLE');
    const description = this.generateDescription();
    const subdomainInputField = this.generateSubdomainInputField();
    const purchaseButton = this.generatePurchaseButton();
    const statusLabel = this.state.subdomain.length > 0 ? this.generateStatusLabel() : null;
    const modal = this.generateModal();
    const esLogoButton = this.generateESLogoButton();
    const component = constants.supportedNetworks.includes(this.props.network.id) ? (
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
        <h5 className="ETHSimple-title">{title}</h5>
        <div className="ETHSimple-description">{description}</div>
        {component}
        {esLogoButton}
      </div>
    );
  }

  public UNSAFE_componentWillReceiveProps(nextProps: Props) {
    if (nextProps.txBroadcasted && this.state.showModal) {
      this.closeModal(false);
    }
  }

  private setAddress = () => {
    const { checksum, wallet } = this.props;
    const address = checksum(wallet.getAddressString());
    this.setState({ address });
  };

  private generateDescription = (): React.ReactElement<any> => {
    const { address, subdomain } = this.state;
    const { supportedNetworks, esFullDomain, placeholderDomain, defaultDescAddr } = constants;
    const displayAddr = address.length > 0 ? address : defaultDescAddr;
    const domainName =
      subdomain.length > 0 ? subdomain + esFullDomain : placeholderDomain + esFullDomain;
    const cutoff = subdomain.length > 0 && subdomain.length < 5 ? 0 : 15;
    const addr = displayAddr.substring(0, displayAddr.length - cutoff) + (cutoff > 0 ? '...' : '');
    const supportedNetwork = (supportedNetworks as string[]).includes(this.props.network.id);
    const descriptionText = supportedNetwork ? 'ETHSIMPLE_DESC' : 'ETHSIMPLE_UNSUPPORTED_NETWORK';
    const textVariables = supportedNetwork
      ? { $domain: domainName, $addr: addr }
      : { $network: this.props.network.id };
    return translate(descriptionText, textVariables as any);
  };

  private generateSubdomainInputField = (): React.ReactElement<any> => {
    return (
      <div className="input-group-wrapper">
        <label className="input-group input-group-inline">
          <Input
            className="ETHSimple-name ETHSimple-name-input border-rad-right-0"
            value={this.state.subdomain}
            isValid={true}
            type="text"
            placeholder={constants.placeholderDomain}
            spellCheck={false}
            onChange={this.onChange}
          />
          <span className="ETHSimple-name input-group-addon">{constants.esFullDomain}</span>
        </label>
      </div>
    );
  };

  private generatePurchaseButton = (): React.ReactElement<any> => {
    const {
      purchaseButtonClicked,
      subdomain,
      isRetrieved,
      isAvailable,
      isOwnedBySelf
    } = this.state;
    const { isResolving, gasEstimation } = this.props;
    const subdomainFieldEmpty = subdomain.length < 1;
    const insufficientBalance = this.insufficientEtherBalance();
    const gasEstimateRequested = gasEstimation === transactionNetworkTypes.RequestStatus.REQUESTED;
    const purchaseDisabled =
      isResolving ||
      !isRetrieved ||
      purchaseButtonClicked ||
      subdomainFieldEmpty ||
      !isAvailable ||
      isOwnedBySelf ||
      insufficientBalance ||
      gasEstimateRequested;
    const buttonTitle = translate('ETHSIMPLE_ACTION', {
      $domainPriceEth: constants.subdomainPriceETH
    });
    return (
      <button
        className="ETHSimple-button btn btn-primary btn-block"
        disabled={purchaseDisabled}
        onClick={this.purchaseSubdomain}
      >
        {buttonTitle}
      </button>
    );
  };

  private generateStatusLabel = (): React.ReactElement<any> => {
    const {
      subdomain,
      purchaseButtonClicked,
      pollInitiated,
      isRetrieved,
      isAvailable,
      isOwnedBySelf
    } = this.state;
    const insufficientBalance = this.insufficientEtherBalance();
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
    const domainName = { $domain: subdomain + constants.esFullDomain };
    let className = '';
    let icon = null;
    let label = null;
    let button = null;

    if (purchaseButtonClicked) {
      className = warningClass;
      icon = spinnerIcon;
      label = pollInitiated
        ? translate('ETHSIMPLE_STATUS_WAIT_FOR_MINE')
        : translate('ETHSIMPLE_STATUS_WAIT_FOR_CONFIRM');
    } else if (isRetrieved) {
      if (isAvailable) {
        button = refreshButton;
        if (insufficientBalance) {
          className = warningClass;
          label = translate('ETHSIMPLE_STATUS_INSUFFICIENT_FUNDS', domainName);
        } else {
          className = validClass;
          icon = checkIcon;
          label = translate('ETHSIMPLE_STATUS_AVAILABLE', domainName);
        }
      } else {
        if (isOwnedBySelf) {
          className = validClass;
          label = translate('ETHSIMPLE_STATUS_OWNED_BY_USER', domainName);
        } else {
          className = invalidClass;
          icon = xIcon;
          label = translate('ETHSIMPLE_STATUS_UNAVAILABLE', domainName);
        }
      }
    } else {
      className = warningClass;
      icon = spinnerIcon;
      label = translate('ETHSIMPLE_STATUS_RESOLVING_DOMAIN', domainName);
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

  /**
   *
   * @desc Called on changes to the subdomain input field. Updates the subdomain string and sets purchaseButtonClicked to false. On the callback it requests resolution of the domain and
   */
  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const subdomain = normalise(event.currentTarget.value.trim().toLowerCase());
    if (subdomain !== this.state.subdomain) {
      this.setState(
        {
          subdomain,
          purchaseButtonClicked: false,
          lastKeystrokeTime: Date.now(),
          isRetrieved: false
        },
        () => {
          subdomain.length > 0
            ? setTimeout(this.processKeystroke, this.state.resolutionDelay)
            : this.props.resetTx();
        }
      );
    }
  };

  /**
   *
   * @desc Called on a delay after a keystroke is recorded in onChange(). This function checks if a more recent keystroke has occurred before requesting an ENS lookup in order to reduce superfluous calls
   */
  private processKeystroke = () => {
    const { resolveDomain, network } = this.props;
    const { lastKeystrokeTime, subdomain, resolutionDelay } = this.state;
    if (lastKeystrokeTime < Date.now() - resolutionDelay && subdomain.length > 0) {
      resolveDomain(subdomain + constants.esDomain, network.isTestnet);
    }
  };

  /**
   *
   * @desc Calculates the cost of the subdomain registration transaction and compares that to the available balance in the user's wallet. Returns true if the balance is insufficient to make the purchase
   * @returns {boolean}
   */
  private insufficientEtherBalance = (): boolean => {
    const { subdomainPriceWei, purchaseSubdomainGasLimit } = constants;
    const { gasPrice, etherBalance } = this.props;
    const txCost = Wei(subdomainPriceWei).add(
      gasPrice.value.mul(handleValues(purchaseSubdomainGasLimit))
    );
    return !!etherBalance && txCost.gt(etherBalance);
  };

  /**
   *
   * @desc Handles the click event from the purchase button
   * @param {React.FormEvent<HTMLElement>} onClick or onSubmit event
   */
  private purchaseSubdomain = (ev: React.FormEvent<HTMLElement>) => {
    const { autoGasLimit, toggleAutoGasLimit, gasEstimation } = this.props;
    ev.preventDefault();
    if (autoGasLimit) {
      toggleAutoGasLimit();
    }
    if (gasEstimation === transactionNetworkTypes.RequestStatus.REQUESTED) {
      return;
    }
    this.setState(
      {
        purchaseButtonClicked: true,
        pollInitiated: false
      },
      () => this.setTxFields()
    );
  };

  /**
   *
   * @desc Sets the fields of the tx singleton with the desired parameters of a new subdomain registration and requests the nonce if needed
   */
  private setTxFields = () => {
    const {
      nonceStatus,
      getNonce,
      setToField,
      setValueField,
      inputData,
      inputGasPrice,
      inputGasLimit
    } = this.props;
    const txAddress = this.getTxAddress();
    const txValue = this.getTxValue();
    const txData = this.getTxData();
    const txGasPrice = this.getTxGasPrice();
    const txGasLimit = this.getTxGasLimit();
    const status = transactionNetworkTypes.RequestStatus;
    if (nonceStatus !== status.SUCCEEDED && nonceStatus !== status.REQUESTED) {
      getNonce();
    }
    setToField({ raw: txAddress, value: Address(txAddress) });
    setValueField({ raw: fromWei(txValue, 'ether'), value: txValue });
    inputData(txData);
    inputGasPrice(txGasPrice);
    inputGasLimit(txGasLimit);
  };

  /**
   *
   * @desc Returns the address of the ETHSimple subdomain registrar contract, which is dependent on the configured network
   * @returns {string}
   */
  private getTxAddress = (): string => {
    const { subdomainRegistrarAddr } = constants;
    return this.props.network.isTestnet
      ? subdomainRegistrarAddr.ropsten
      : subdomainRegistrarAddr.mainnet;
  };

  /**
   *
   * @desc Returns the value parameter for a subdomain registration tx denominated in Wei
   * @returns {Wei}
   */
  private getTxValue = (): Wei => {
    return Wei(constants.subdomainPriceWei);
  };

  /**
   *
   * @desc Returns the encoded data parameter for a subdomain registration tx
   * @returns {string}
   */
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

  /**
   *
   * @desc Returns the gas price parameter for a subdomain registration tx
   * @returns {string}
   */
  private getTxGasPrice = (): string => {
    const { gasEstimates } = this.props;
    return !!gasEstimates ? gasEstimates.fast.toString() : constants.purchaseSubdomainGasPrice;
  };

  /**
   *
   * @desc Returns the hex-encoded gas limit parameter for a subdomain registration tx
   * @returns {string}
   */
  private getTxGasLimit = (): string => {
    return bufferToHex(new BN(constants.purchaseSubdomainGasLimit));
  };

  /**
   *
   * @desc Returns true if the purchase button has been clicked, a signature is not pending, the tx has not been signed, and gas estimation has not been requested
   * @returns {boolean}
   */
  private signTxIntended = (): boolean => {
    const { signaturePending, signedTx, gasEstimation } = this.props;
    return (
      this.state.purchaseButtonClicked &&
      !signaturePending &&
      !signedTx &&
      gasEstimation !== transactionNetworkTypes.RequestStatus.REQUESTED
    );
  };

  /**
   *
   * @desc Returns true if each of the tx parameters have been correctly set
   * @returns {boolean}
   */
  private txFieldsValid = (): boolean => {
    const { isFullTransaction, transaction, nonceStatus } = this.props;
    const txFields = getTransactionFields(transaction);
    const txAddress = this.getTxAddress().toString();
    const txValue = this.cleanHex(this.getTxValue());
    const txData = this.getTxData();
    const txGasPrice = this.cleanHex(gasPriceToBase(Number(this.getTxGasPrice())));
    const txGasLimit = addHexPrefix(unpad(this.getTxGasLimit()));
    return (
      isFullTransaction &&
      txFields.to === txAddress &&
      txFields.data === txData &&
      txFields.value === txValue &&
      txFields.gasPrice === txGasPrice &&
      txFields.gasLimit === txGasLimit &&
      nonceStatus === transactionNetworkTypes.RequestStatus.SUCCEEDED
    );
  };

  private cleanHex = (input: BN): string => {
    return addHexPrefix(unpad(bufferToHex(input)));
  };

  /**
   *
   * @desc Sign the tx and open the confirmation modal
   */
  private signTx = () => {
    const { signTx, transaction } = this.props;
    signTx(transaction);
    this.openModal();
  };

  /**
   *
   * @desc Returns true if the recent tx was successfully broadcasted and the tx confirmation poll has not been started
   * @returns {boolean}
   */
  private txBroadcastSuccessful = (): boolean => {
    const { currentTxStatus } = this.props;
    const { purchaseButtonClicked, pollInitiated } = this.state;
    return (
      purchaseButtonClicked &&
      !pollInitiated &&
      !!currentTxStatus &&
      currentTxStatus &&
      currentTxStatus.broadcastSuccessful &&
      !!currentTxStatus.broadcastedHash
    );
  };

  /**
   *
   * @desc Returns true if the recent tx attempted to broadcast and the broadcast failed
   * @param {Props}
   * @returns {boolean}
   */
  private txBroadcastFailed = (prevProps: Props): boolean => {
    const { currentTxStatus } = this.props;
    return (
      this.state.purchaseButtonClicked &&
      !!currentTxStatus &&
      !!prevProps.currentTxStatus &&
      !prevProps.currentTxStatus.broadcastSuccessful &&
      prevProps.currentTxStatus.isBroadcasting &&
      !currentTxStatus.broadcastSuccessful &&
      !currentTxStatus.isBroadcasting
    );
  };

  /**
   *
   * @desc Returns true if the recent tx was successfully broadcasted and the tx receipt has been retrieved and shows a success status
   * @returns {boolean}
   */
  private txConfirmed = (): boolean => {
    const { purchaseButtonClicked, pollInitiated, broadcastedHash } = this.state;
    const { txDatas } = this.props;
    return (
      purchaseButtonClicked &&
      pollInitiated &&
      !!txDatas[broadcastedHash] &&
      !!txDatas[broadcastedHash].receipt &&
      !!(txDatas[broadcastedHash].receipt as TransactionReceipt).status &&
      (txDatas[broadcastedHash].receipt as TransactionReceipt).status === 1
    );
  };

  /**
   *
   * @desc Passes the purchased subdomain name to the AccountAddress component, closes the tx broadcasted notification, shows the tx confirmed notification, refreshes the account's balance, and refreshes the newly registered domain's resolution data
   */
  private purchaseComplete = () => {
    this.props.subdomainPurchased(this.state.subdomain + constants.esFullDomain);
    this.closeTxBroadcastedNotification();
    this.showTxConfirmedNotification();
    this.setState({ purchaseButtonClicked: false }, () => {
      this.props.refreshBalance();
      this.resolveNamePurchaseOwnership(this.state.subdomain + constants.esDomain, this.state.address);
    });
  };

  /**
   *
   * @desc continually refreshes the resolution data for a recently registered domain name
   * until the data shows ownership or the ttl has been reached.
   */
  private resolveNamePurchaseOwnership = (domainToCheck: string, address: string, ttl = 35: number) => {
  const { isResolving, domainRequests } = this.props;
  const req = domainRequests[domainToCheck];
  const requestDataValid = !!req && !!req.data;
  const isAvailableDomain = requestDataValid
    ? (req.data as IBaseSubdomainRequest).mode === NameState.Open
    : false;
  const ownedByThisAddress = requestDataValid
    ? (req.data as IBaseSubdomainRequest).ownerAddress === address
    : false;

  if (ttl > 0) {
    if (!!isResolving) {
      setTimeout(() => this.resolveNamePurchaseOwnership(domainToCheck, address, ttl - 1), 250)
    } else {
      if (!ownedByThisAddress) {
        this.refreshDomainResolution();
        setTimeout(() => this.resolveNamePurchaseOwnership(domainToCheck, address, ttl - 1), 350);
      }
    }
  } else {
    setTimeout(this.refreshDomainResolution, 3000);
  }
}

  /**
   *
   * @desc Refreshes the resolution data for a recently registered domain name
   */
  private refreshDomainResolution = () => {
    const { resolveDomain, network } = this.props;
    resolveDomain(this.state.subdomain + constants.esDomain, network.isTestnet, true);
  };

  /**
   *
   * @desc Finds the tx broadcasted notification and closes it
   */
  private closeTxBroadcastedNotification = () => {
    const { notifications, closeNotification } = this.props;
    const { broadcastedHash } = this.state;
    const txBroadcastedNotification = notifications.find(notif => {
      return !!notif.componentConfig && notif.componentConfig.txHash === broadcastedHash;
    });
    if (!!txBroadcastedNotification) {
      closeNotification(txBroadcastedNotification);
    }
  };

  /**
   *
   * @desc Builds a success notification for a confirmed tx and shows it for 10 seconds
   */
  private showTxConfirmedNotification = () => {
    this.props.showNotification(
      'success',
      translateRaw('ETHSIMPLE_TX_CONFIRMED_NOTIF_MSG', {
        $domain: this.state.subdomain + constants.esFullDomain
      }),
      10000
    );
  };

  private openModal = () => {
    const { currentTxStatus, showNotification } = this.props;
    !!currentTxStatus && (currentTxStatus.broadcastSuccessful || currentTxStatus.isBroadcasting)
      ? showNotification(
          'warning',
          'The current transaction is already broadcasting or has been successfully broadcasted'
        )
      : this.setState({ showModal: true });
  };

  private cancelModal = () => this.closeModal(true);

  private closeModal = (closedByUser: boolean) => {
    const { autoGasLimit, toggleAutoGasLimit } = this.props;
    this.setState(
      {
        showModal: false,
        purchaseButtonClicked: !closedByUser
      },
      () => {
        if (!autoGasLimit) {
          toggleAutoGasLimit();
        }
      }
    );
  };

  private pollForTxReceipt = () => setTimeout(this.fetchTxReceipt, 10000);

  /**
   *
   * @desc Fetch the receipt of the broadcasted tx
   */
  private fetchTxReceipt = () => {
    this.setState({ pollTimeout: false }, () => {
      const { fetchTxData } = this.props;
      const { purchaseButtonClicked, broadcastedHash } = this.state;
      if (purchaseButtonClicked && !!broadcastedHash) {
        fetchTxData(broadcastedHash);
      }
    });
  };
}

function mapStateToProps(state: AppState): StateProps {
  return {
    etherBalance: walletSelectors.getEtherBalance(state),
    domainRequests: state.ens.domainRequests,
    isResolving: ensSelectors.getResolvingDomain(state),
    nonceStatus: transactionNetworkSelectors.getNetworkStatus(state).getNonceStatus,
    gasEstimation: transactionNetworkSelectors.getNetworkStatus(state).gasEstimationStatus,
    network: configSelectors.getNetworkConfig(state),
    checksum: configSelectors.getChecksumAddressFn(state),
    gasEstimates: gasSelectors.getEstimates(state),
    gasPrice: transactionFieldsSelectors.getGasPrice(state),
    autoGasLimit: configMetaSelectors.getAutoGasLimitEnabled(state),
    notifications: state.notifications,
    ...derivedSelectors.getTransaction(state),
    txDatas: transactionsSelectors.getTransactionDatas(state),
    currentTxStatus: transactionSelectors.getCurrentTransactionStatus(state),
    txBroadcasted: transactionSelectors.currentTransactionBroadcasted(state),
    signaturePending: derivedSelectors.signaturePending(state).isSignaturePending,
    signedTx:
      !!transactionSignSelectors.getSignedTx(state) || !!transactionSignSelectors.getWeb3Tx(state)
  };
}

const mapDispatchToProps: DispatchProps = {
  showNotification: notificationsActions.showNotification,
  closeNotification: notificationsActions.closeNotification,
  resolveDomain: ensActions.resolveDomainRequested,
  setToField: transactionFieldsActions.setToField,
  setValueField: transactionFieldsActions.setValueField,
  inputData: transactionFieldsActions.inputData,
  inputGasLimit: transactionFieldsActions.inputGasLimit,
  inputGasPrice: transactionFieldsActions.inputGasPrice,
  getNonce: transactionNetworkActions.getNonceRequested,
  resetTx: transactionFieldsActions.resetTransactionRequested,
  signTx: transactionSignActions.signTransactionRequested,
  fetchTxData: transactionsActions.fetchTransactionData,
  refreshBalance: walletActions.refreshAccountBalance,
  toggleAutoGasLimit: configMetaActions.toggleAutoGasLimit
};

export default connect(mapStateToProps, mapDispatchToProps)(ETHSimpleClass);
