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
import { configMetaActions } from 'features/config';
import {
  transactionFieldsActions,
  transactionNetworkActions,
  transactionSignActions,
  transactionSelectors,
  transactionBroadcastTypes,
  transactionSignSelectors
} from 'features/transaction';
import { transactionsActions } from 'features/transactions';
import { ensActions } from 'features/ens';
import { notificationsActions } from 'features/notifications';
import Contract from 'libs/contracts';
import ENS from 'libs/ens/contracts';
import networkConfigs from 'libs/ens/networkConfigs';
import { IBaseAddressRequest } from 'libs/ens';
import { Address, Wei, gasPriceToBase } from 'libs/units';
import { getTransactionFields } from 'libs/transaction/utils/ether';
import { Spinner } from 'components/ui';
import { ConfirmationModal } from 'components/ConfirmationModal';
import './AccountNameLabel.scss';

interface StateProps {
  notifications: AppState['notifications'];
  txNetworkState: AppState['transaction']['network'];
  isFullTransaction: boolean;
  txState: { [txHash: string]: TransactionState };
  currentTransaction: false | transactionBroadcastTypes.ITransactionStatus | null;
  transaction: EthTx;
  transactionBroadcasted: boolean | null;
  signaturePending: boolean;
  signedTx: boolean;
  gasEstimates: AppState['gas']['estimates'];
  autoGasLimitEstimationStatus: AppState['config']['meta']['autoGasLimit'];
}

interface DispatchProps {
  showNotification: notificationsActions.TShowNotification;
  closeNotification: notificationsActions.TCloseNotification;
  reverseResolveAddressRequested: ensActions.TReverseResolveAddressRequested;
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
  successStatus: string;
}

class AccountNameLabel extends React.Component<Props, State> {
  public state = {
    reverseRegistrarInstance: ENS.reverse,
    showModal: false,
    hover: false,
    setNameButtonClicked: false,
    initialPollRequested: false,
    pollTimeout: false,
    successStatus: 'SUCCESS'
  };

  public componentDidUpdate(prevProps: Props) {
    const { txState, txNetworkState, currentTransaction } = this.props;
    const { setNameButtonClicked, pollTimeout } = this.state;
    if (setNameButtonClicked) {
      if (txNetworkState !== prevProps.txNetworkState) {
        if (this.signTxIntended() && this.txFieldsValid()) {
          this.signTx();
        }
      }
      if (currentTransaction !== prevProps.currentTransaction) {
        if (this.txBroadcastSuccessful()) {
          this.setState({ initialPollRequested: true });
          this.pollForTxHash();
          this.handleNoHover();
        } else if (this.txBroadcastFailed(prevProps)) {
          this.setState({
            setNameButtonClicked: false
          });
        }
      }
      if (txState !== prevProps.txState) {
        if (this.txConfirmed()) {
          this.setNameComplete();
        } else if (!pollTimeout) {
          this.setState({ pollTimeout: true });
          this.pollForTxHash();
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
      <React.Fragment>
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
      </React.Fragment>
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
    if (this.state.setNameButtonClicked) {
      this.setState({ setNameButtonClicked: false });
    } else {
      this.setState(
        {
          setNameButtonClicked: true,
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
    }
  };

  private getTxAddress = (): string => {
    return networkConfigs.main.public.reverse;
  };

  private getTxData = (): string => {
    const { purchasedSubdomainLabel } = this.props;
    const nameToSet = !!purchasedSubdomainLabel ? purchasedSubdomainLabel : '';
    return this.state.reverseRegistrarInstance.setName.encodeInput({ name: nameToSet });
  };

  private getTxValue = (): string => {
    return bufferToHex(Wei('0'));
  };

  private getTxGasPrice = (): string => {
    const { gasEstimates } = this.props;
    const gasPrice = !!gasEstimates ? gasEstimates.fast.toString() : '20';
    return gasPrice;
  };

  private getTxGasLimit = (): string => {
    return bufferToHex(new BN('105875'));
  };

  private setTxFields = () => {
    const { successStatus } = this.state;
    const { txNetworkState, transaction } = this.props;
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
    if (txFields.value !== txValue && txFields.value !== txValue.substring(0, txValue.length - 1)) {
      this.props.setValueField({
        raw: txValue,
        value: Wei(txValue)
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
    if (this.state.setNameButtonClicked && !signaturePending && !signedTx) {
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
      (txFields.value === txValue || txFields.value === txValue.substring(0, txValue.length - 1)) &&
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
    const { setNameButtonClicked, initialPollRequested } = this.state;
    const { currentTransaction } = this.props;
    if (
      setNameButtonClicked &&
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
      this.state.setNameButtonClicked &&
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
    const { setNameButtonClicked, initialPollRequested } = this.state;
    const { currentTransaction, txState } = this.props;
    if (
      setNameButtonClicked &&
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

  private setNameComplete = () => {
    this.closeTxBroadcastedNotification();
    this.showTxConfirmedNotification();
    this.setState(
      {
        setNameButtonClicked: false,
        initialPollRequested: false
      },
      () => {
        this.props.resetTransactionRequested();
        this.props.getNonceRequested();
        setTimeout(this.refreshAddressResolution, 3000);
      }
    );
  };

  private refreshAddressResolution = () => {
    const { address } = this.props;
    this.props.reverseResolveAddressRequested(address, true);
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
    const { purchasedSubdomainLabel } = this.props;
    const accountName = !!purchasedSubdomainLabel ? purchasedSubdomainLabel : '';
    this.props.showNotification(
      'success',
      translateRaw('ENS_REVERSE_RESOLVE_TX_CONFIRMED_MODAL_DESC', {
        $accountName: accountName
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

  private cancelModal = () => this.closeModal(true);

  private closeModal = (closedByUser: boolean) => {
    this.setState(
      {
        showModal: false,
        setNameButtonClicked: !closedByUser
      },
      () => {
        if (!this.props.autoGasLimitEstimationStatus) {
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
        this.state.setNameButtonClicked &&
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
    txNetworkState: state.transaction.network,
    notifications: state.notifications,
    txState: state.transactions.txData,
    ...derivedSelectors.getTransaction(state),
    currentTransaction: transactionSelectors.getCurrentTransactionStatus(state),
    transactionBroadcasted: transactionSelectors.currentTransactionBroadcasted(state),
    signaturePending: derivedSelectors.signaturePending(state).isSignaturePending,
    signedTx:
      !!transactionSignSelectors.getSignedTx(state) || !!transactionSignSelectors.getWeb3Tx(state),
    gasEstimates: gasSelectors.getEstimates(state),
    autoGasLimitEstimationStatus: state.config.meta.autoGasLimit
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
  toggleAutoGasLimit: configMetaActions.toggleAutoGasLimit
};

export default connect(mapStateToProps, mapDispatchToProps)(AccountNameLabel);
