import React from 'react';
import { connect } from 'react-redux';
import { bufferToHex, unpad, addHexPrefix } from 'ethereumjs-util';
import EthTx from 'ethereumjs-tx';
import BN from 'bn.js';

import { translate, translateRaw } from 'translations';
import { TransactionState, TransactionReceipt } from 'types/transactions';
import * as derivedSelectors from 'features/selectors';
import { AppState } from 'features/reducers';
import { gasSelectors } from 'features/gas';
import { configMetaActions, configMetaSelectors } from 'features/config';
import { getAddressLabels, addressBookActions } from 'features/addressBook';
import {
  transactionFieldsActions,
  transactionNetworkActions,
  transactionNetworkSelectors,
  transactionSelectors,
  transactionBroadcastTypes,
  transactionSignSelectors,
  transactionSignActions
} from 'features/transaction';
import { transactionNetworkTypes } from 'features/transaction/network';
import { transactionsActions, transactionsSelectors } from 'features/transactions';
import { ensActions } from 'features/ens';
import { notificationsActions } from 'features/notifications';
import Contract from 'libs/contracts';
import ENS from 'libs/ens/contracts';
import networkConfigs from 'libs/ens/networkConfigs';
import { IBaseAddressRequest } from 'libs/ens';
import { Address, Wei, gasPriceToBase, fromWei } from 'libs/units';
import { getTransactionFields } from 'libs/transaction/utils/ether';
import { Spinner } from 'components/ui';
import { ConfirmationModal } from 'components/ConfirmationModal';
import './AccountNameLabel.scss';

interface StateProps {
  notifications: AppState['notifications'];
  nonceStatus: AppState['transaction']['network']['getNonceStatus'];
  gasEstimationStatus: AppState['transaction']['network']['gasEstimationStatus'];
  isFullTransaction: boolean;
  txDatas: { [txHash: string]: TransactionState };
  currentTransactionStatus: false | transactionBroadcastTypes.ITransactionStatus | null;
  transaction: EthTx;
  transactionBroadcasted: boolean | null;
  signaturePending: boolean;
  signedTx: boolean;
  gasEstimates: AppState['gas']['estimates'];
  autoGasLimitEnabled: AppState['config']['meta']['autoGasLimit'];
}

interface DispatchProps {
  reverseResolveAddressRequested: ensActions.TReverseResolveAddressRequested;
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
  toggleAutoGasLimit: configMetaActions.TToggleAutoGasLimit;
  setAddressLabelEntry: addressBookActions.TSetAddressLabelEntry;
}

interface OwnProps {
  address: string;
  addressLabel: string;
  purchasedSubdomainLabel: string | null;
  addressRequest: IBaseAddressRequest | null;
}

type Props = StateProps & DispatchProps & OwnProps;

interface State {
  reverseRegistrarInstance: Contract;
  showModal: boolean;
  hover: boolean;
  setNameButtonClicked: boolean;
  initialPollRequested: boolean;
  pollTimeout: boolean;
  broadcastedHash: string;
}

class AccountNameLabel extends React.Component<Props, State> {
  public state = {
    reverseRegistrarInstance: ENS.reverse,
    showModal: false,
    hover: false,
    setNameButtonClicked: false,
    initialPollRequested: false,
    pollTimeout: false,
    broadcastedHash: ''
  };

  public componentDidUpdate(prevProps: Props) {
    const { txDatas, currentTransactionStatus } = this.props;
    const { setNameButtonClicked, pollTimeout } = this.state;
    if (setNameButtonClicked) {
      if (this.signTxIntended() && this.txFieldsValid()) {
        this.signTx();
      }
      if (currentTransactionStatus !== prevProps.currentTransactionStatus) {
        if (this.txBroadcastSuccessful()) {
          this.setState({
            broadcastedHash: currentTransactionStatus.broadcastedHash,
            initialPollRequested: true
          });
          this.pollForTxHash();
          this.handleNoHover();
        } else if (this.txBroadcastFailed(prevProps)) {
          this.setState({
            setNameButtonClicked: false
          });
        }
      }
      if (txDatas !== prevProps.txDatas) {
        if (this.txConfirmed()) {
          this.setNameComplete();
        } else if (!pollTimeout) {
          this.setState({ pollTimeout: true }, () => this.pollForTxHash());
        }
      }
    }
  }

  public render() {
    const { addressRequest, purchasedSubdomainLabel } = this.props;
    const accountNameButton =
      !addressRequest && (!purchasedSubdomainLabel || purchasedSubdomainLabel.length < 1)
        ? null
        : this.generateAccountNameButton();
    const modal = this.generateModal();
    return (
      <div className="AccountNameLabel">
        <div
          className="help-block"
          onMouseEnter={this.handleHover}
          onMouseLeave={this.handleNoHover}
        >
          {accountNameButton}
        </div>
        {modal}
      </div>
    );
  }

  private generateAccountNameButton = (): React.ReactElement<any> => {
    const { hover, setNameButtonClicked } = this.state;
    const { addressRequest, purchasedSubdomainLabel } = this.props;
    const showName = !!addressRequest && addressRequest.name.length > 0;
    const iconBaseName = 'help-block status-icon fa fa-';
    const spanBaseName = 'help-block status-label is-';
    const outerDivClassName = 'AccountNameLabel-name-wrapper';
    const divClassName = 'help-block AccountNameLabel-name-addr--small';
    const labelClassName = 'AccountNameLabel-name-label';
    const labelValue = showName
      ? (addressRequest as IBaseAddressRequest).name
      : purchasedSubdomainLabel;
    const iconClassName =
      iconBaseName +
      (showName
        ? 'check is-valid'
        : setNameButtonClicked ? '' : hover ? 'check is-valid' : 'remove is-invalid');
    const spanRole = showName ? '' : 'button';
    const spanClassName =
      spanBaseName +
      (showName ? 'valid' : setNameButtonClicked ? 'semivalid' : hover ? 'valid' : 'invalid');
    const title = showName
      ? translate('ENS_REVERSE_RESOLVE_NAME_PUBLIC')
      : setNameButtonClicked
        ? translate('ENS_REVERSE_RESOLVE_TX_WAIT')
        : hover
          ? translate('ENS_REVERSE_RESOLVE_UPDATE_NAME', {
              $accountName: !!purchasedSubdomainLabel ? purchasedSubdomainLabel : ''
            })
          : translate('ENS_REVERSE_RESOLVE_NAME_EMPTY');
    const spinner = setNameButtonClicked ? <Spinner /> : null;
    const clickAction = showName ? undefined : this.setName;

    return (
      <div className={outerDivClassName}>
        <div className={divClassName}>
          <label className={labelClassName}>{labelValue}</label>
          <i className={iconClassName} />
          <span role={spanRole} onClick={clickAction} className={spanClassName}>
            {spinner}
            {title}
          </span>
        </div>
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

  private handleHover = () => {
    const { addressRequest } = this.props;
    if (!(!!addressRequest && addressRequest.name.length > 0)) {
      this.setState({ hover: true });
    }
  };

  private handleNoHover = () => this.setState({ hover: false });

  private setName = (ev: React.FormEvent<HTMLElement>) => {
    ev.preventDefault();
    if (this.props.autoGasLimitEnabled) {
      this.props.toggleAutoGasLimit();
    }
    if (this.props.gasEstimationStatus === transactionNetworkTypes.RequestStatus.REQUESTED) {
      return;
    }
    this.setState(
      {
        setNameButtonClicked: true,
        initialPollRequested: false
      },
      () => {
        this.setTxFields();
      }
    );
  };

  private setTxFields = () => {
    const {
      nonceStatus,
      setToField,
      setValueField,
      inputData,
      inputGasPrice,
      inputGasLimit,
      getNonceRequested
    } = this.props;
    const txAddress = this.getTxAddress();
    const txData = this.getTxData();
    const txValue = this.getTxValue();
    const txGasPrice = this.getTxGasPrice();
    const txGasLimit = this.getTxGasLimit();
    if (
      nonceStatus !== transactionNetworkTypes.RequestStatus.SUCCEEDED &&
      nonceStatus !== transactionNetworkTypes.RequestStatus.REQUESTED
    ) {
      getNonceRequested();
    }
    setToField({ raw: txAddress, value: Address(txAddress) });
    setValueField({ raw: fromWei(txValue, 'ether'), value: txValue });
    inputData(txData);
    inputGasPrice(txGasPrice);
    inputGasLimit(txGasLimit);
  };

  private getTxAddress = (): string => {
    return networkConfigs.main.public.reverse;
  };

  private getTxValue = (): Wei => {
    return Wei('0');
  };

  private getTxData = (): string => {
    const { purchasedSubdomainLabel } = this.props;
    const nameToSet = !!purchasedSubdomainLabel ? purchasedSubdomainLabel : '';
    return this.state.reverseRegistrarInstance.setName.encodeInput({ name: nameToSet });
  };

  private getTxGasPrice = (): string => {
    const { gasEstimates } = this.props;
    return !!gasEstimates ? gasEstimates.fast.toString() : '20';
  };

  private getTxGasLimit = (): string => {
    return bufferToHex(new BN('105875'));
  };

  private signTxIntended = (): boolean => {
    const { signaturePending, signedTx, gasEstimationStatus } = this.props;
    return (
      this.state.setNameButtonClicked &&
      !signaturePending &&
      !signedTx &&
      gasEstimationStatus !== transactionNetworkTypes.RequestStatus.REQUESTED
    );
  };

  private txFieldsValid = (): boolean => {
    const { isFullTransaction, transaction, nonceStatus } = this.props;
    const txFields = getTransactionFields(transaction);
    const txAddress = this.getTxAddress();
    const txData = this.getTxData();
    const txValue = addHexPrefix(unpad(bufferToHex(this.getTxValue())));
    const txGasPrice = addHexPrefix(
      unpad(bufferToHex(gasPriceToBase(Number(this.getTxGasPrice()))))
    );
    const txGasLimit = addHexPrefix(unpad(this.getTxGasLimit()));
    return (
      txFields.to === txAddress.toString() &&
      txFields.data === txData &&
      (txFields.value === txValue ||
        txFields.value === txValue.substring(0, txValue.length - 1) ||
        txFields.value === txValue + '0') &&
      txFields.gasPrice === txGasPrice &&
      txFields.gasLimit === txGasLimit &&
      nonceStatus === transactionNetworkTypes.RequestStatus.SUCCEEDED &&
      isFullTransaction
    );
  };

  private signTx = () => {
    this.props.signTransactionRequested(this.props.transaction);
    this.openModal();
  };

  private txBroadcastSuccessful = (): boolean => {
    const { setNameButtonClicked, initialPollRequested } = this.state;
    const { currentTransactionStatus } = this.props;
    return (
      setNameButtonClicked &&
      !initialPollRequested &&
      !!currentTransactionStatus &&
      currentTransactionStatus &&
      currentTransactionStatus.broadcastSuccessful &&
      !!currentTransactionStatus.broadcastedHash
    );
  };

  private txBroadcastFailed = (prevProps: Props): boolean => {
    const { currentTransactionStatus } = this.props;
    return (
      this.state.setNameButtonClicked &&
      !!currentTransactionStatus &&
      !!prevProps.currentTransactionStatus &&
      !prevProps.currentTransactionStatus.broadcastSuccessful &&
      prevProps.currentTransactionStatus.isBroadcasting &&
      !currentTransactionStatus.broadcastSuccessful &&
      !currentTransactionStatus.isBroadcasting
    );
  };

  private txConfirmed = (): boolean => {
    const { setNameButtonClicked, initialPollRequested, broadcastedHash } = this.state;
    const { txDatas } = this.props;
    return (
      setNameButtonClicked &&
      initialPollRequested &&
      !!txDatas[broadcastedHash] &&
      !!txDatas[broadcastedHash].receipt &&
      !!(txDatas[broadcastedHash].receipt as TransactionReceipt).status &&
      (txDatas[broadcastedHash].receipt as TransactionReceipt).status === 1
    );
  };

  private setNameComplete = () => {
    this.closeTxBroadcastedNotification();
    this.showTxConfirmedNotification();
    this.setState(
      {
        setNameButtonClicked: false,
        initialPollRequested: false
      },
      () => {
        setTimeout(this.refreshAddressResolution, 3000);
      }
    );
  };

  private refreshAddressResolution = () => {
    const { address } = this.props;
    this.props.reverseResolveAddressRequested(address, true);
  };

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

  private showTxConfirmedNotification = () => {
    const { purchasedSubdomainLabel, showNotification } = this.props;
    const accountName = !!purchasedSubdomainLabel ? purchasedSubdomainLabel : '';
    showNotification(
      'success',
      translateRaw('ENS_REVERSE_RESOLVE_TX_CONFIRMED_MODAL_DESC', {
        $accountName: accountName
      }),
      10000
    );
  };

  private openModal = () => {
    const { currentTransactionStatus, showNotification } = this.props;
    if (
      currentTransactionStatus &&
      (currentTransactionStatus.broadcastSuccessful || currentTransactionStatus.isBroadcasting)
    ) {
      return showNotification(
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
    const { autoGasLimitEnabled, toggleAutoGasLimit } = this.props;
    this.setState(
      {
        showModal: false,
        setNameButtonClicked: !closedByUser
      },
      () => {
        if (!autoGasLimitEnabled) {
          toggleAutoGasLimit();
        }
      }
    );
  };

  private pollForTxHash = () => setTimeout(this.getTxStatus, 10000);

  private getTxStatus = () => {
    this.setState({ pollTimeout: false }, () => {
      const { fetchTransactionData } = this.props;
      const { setNameButtonClicked, broadcastedHash } = this.state;
      if (setNameButtonClicked && !!broadcastedHash) {
        fetchTransactionData(broadcastedHash);
      }
    });
  };
}

function mapStateToProps(state: AppState): StateProps {
  return {
    nonceStatus: transactionNetworkSelectors.getNetworkStatus(state).getNonceStatus,
    gasEstimationStatus: transactionNetworkSelectors.getNetworkStatus(state).gasEstimationStatus,
    autoGasLimitEnabled: configMetaSelectors.getAutoGasLimitEnabled(state),
    gasEstimates: gasSelectors.getEstimates(state),
    notifications: state.notifications,
    ...derivedSelectors.getTransaction(state),
    txDatas: transactionsSelectors.getTransactionDatas(state),
    currentTransactionStatus: transactionSelectors.getCurrentTransactionStatus(state),
    transactionBroadcasted: transactionSelectors.currentTransactionBroadcasted(state),
    signaturePending: derivedSelectors.signaturePending(state).isSignaturePending,
    signedTx:
      !!transactionSignSelectors.getSignedTx(state) || !!transactionSignSelectors.getWeb3Tx(state)
  };
}

const mapDispatchToProps: DispatchProps = {
  showNotification: notificationsActions.showNotification,
  closeNotification: notificationsActions.closeNotification,
  reverseResolveAddressRequested: ensActions.reverseResolveAddressRequested,
  setToField: transactionFieldsActions.setToField,
  setValueField: transactionFieldsActions.setValueField,
  inputData: transactionFieldsActions.inputData,
  inputGasLimit: transactionFieldsActions.inputGasLimit,
  inputGasPrice: transactionFieldsActions.inputGasPrice,
  getNonceRequested: transactionNetworkActions.getNonceRequested,
  resetTransactionRequested: transactionFieldsActions.resetTransactionRequested,
  signTransactionRequested: transactionSignActions.signTransactionRequested,
  fetchTransactionData: transactionsActions.fetchTransactionData,
  toggleAutoGasLimit: configMetaActions.toggleAutoGasLimit,
  setAddressLabelEntry: addressBookActions.setAddressLabelEntry
};

export default connect(mapStateToProps, mapDispatchToProps)(AccountNameLabel);
