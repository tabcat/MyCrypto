import React from 'react';
import { connect } from 'react-redux';
import EthTx from 'ethereumjs-tx';

import { translate, translateRaw } from 'translations';
import { TransactionState, TransactionReceipt } from 'types/transactions';
import * as derivedSelectors from 'features/selectors';
import { AppState } from 'features/reducers';
import { configSelectors } from 'features/config';
import { walletSelectors } from 'features/wallet';
import {
  transactionFieldsActions,
  transactionNetworkActions,
  transactionSignActions,
  transactionSelectors,
  transactionBroadcastTypes,
  transactionSignSelectors,
  transactionNetworkSelectors
} from 'features/transaction';
import { transactionsActions } from 'features/transactions';
import { ensActions } from 'features/ens';
import { notificationsActions } from 'features/notifications';
import Contract from 'libs/contracts';
import ENS from 'libs/ens/contracts';
import networkConfigs from 'libs/ens/networkConfigs';
import { IBaseAddressRequest } from 'libs/ens';
import { Address, Wei } from 'libs/units';
import { getTransactionFields } from 'libs/transaction/utils/ether';
import { Spinner } from 'components/ui';
import { ConfirmationModal } from 'components/ConfirmationModal';
import './AccountNameLabel.scss';

interface StateProps {
  wallet: AppState['wallet']['inst'];
  notifications: AppState['notifications'];
  txNetworkFields: AppState['transaction']['network'];
  addressRequests: AppState['ens']['addressRequests'];
  validGasLimit: boolean;
  networkRequestPending: boolean;
  isFullTransaction: boolean;
  txState: { [txHash: string]: TransactionState };
  currentTransaction: false | transactionBroadcastTypes.ITransactionStatus | null;
  networkConfig: ReturnType<typeof configSelectors.getNetworkConfig>;
  transaction: EthTx;
  transactionBroadcasted: boolean | null;
  signaturePending: boolean;
  signedTx: boolean;
}

interface DispatchProps {
  showNotification: notificationsActions.TShowNotification;
  closeNotification: notificationsActions.TCloseNotification;
  reverseResolveAddressRequested: ensActions.TReverseResolveAddressRequested;
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
}

class AccountNameLabel extends React.Component<Props, State> {
  public state = {
    reverseRegistrarInstance: ENS.reverse,
    showModal: false,
    hover: false,
    setNameButtonClicked: false,
    initialPollRequested: false,
    pollTimeout: false
  };

  public render() {
    const { signaturePending, signedTx } = this.props;
    const { showModal } = this.state;
    const accountNameButton = this.generateAccountNameButton();

    return (
      <div className="AccountNameLabel">
        <div
          className="help-block"
          onMouseEnter={this.handleHover}
          onMouseLeave={this.handleNoHover}
        >
          {accountNameButton}
        </div>
        <ConfirmationModal
          isOpen={!signaturePending && signedTx && showModal}
          onClose={this.cancelModal}
        />
      </div>
    );
  }

  public componentDidUpdate(prevProps: Props) {
    const {
      txState,
      isFullTransaction,
      validGasLimit,
      networkRequestPending,
      txNetworkFields,
      currentTransaction,
      signaturePending
    } = this.props;
    const { setNameButtonClicked, initialPollRequested, pollTimeout } = this.state;
    if (txNetworkFields !== prevProps.txNetworkFields) {
      if (
        setNameButtonClicked &&
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
        setNameButtonClicked &&
        !initialPollRequested &&
        !!currentTransaction &&
        currentTransaction.broadcastSuccessful
      ) {
        this.setState({ initialPollRequested: true });
        this.pollForHash();
        this.handleNoHover();
      } else if (
        setNameButtonClicked &&
        !!currentTransaction &&
        !!prevProps.currentTransaction &&
        !prevProps.currentTransaction.broadcastSuccessful &&
        prevProps.currentTransaction.isBroadcasting &&
        !currentTransaction.broadcastSuccessful &&
        !currentTransaction.isBroadcasting
      ) {
        this.setState({
          setNameButtonClicked: false
        });
      }
    }
    if (txState !== prevProps.txState) {
      if (
        setNameButtonClicked &&
        initialPollRequested &&
        !!currentTransaction &&
        !!currentTransaction.broadcastedHash &&
        !!txState[currentTransaction.broadcastedHash].receipt &&
        !!(txState[currentTransaction.broadcastedHash].receipt as TransactionReceipt).status &&
        (txState[currentTransaction.broadcastedHash].receipt as TransactionReceipt).status === 1
      ) {
        this.setNameComplete();
      } else if (!pollTimeout) {
        this.setState({ pollTimeout: true });
        this.pollForHash();
      }
    }
  }

  private generateAccountNameButton = () => {
    const { hover, setNameButtonClicked } = this.state;
    const { addressRequest, purchasedSubdomainLabel } = this.props;
    if (!addressRequest && (!purchasedSubdomainLabel || purchasedSubdomainLabel.length < 1)) {
      return null;
    }
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

  private handleHover = () => {
    const { addressRequest } = this.props;
    if (!(!!addressRequest && addressRequest.name.length > 0)) {
      this.setState({ hover: true });
    }
  };

  private handleNoHover = () => {
    this.setState({ hover: false });
  };

  private buildTxData = () => {
    const nameToSet = this.props.purchasedSubdomainLabel;
    const inputs = { name: nameToSet } as any;
    const encodedInputData = this.state.reverseRegistrarInstance.setName.encodeInput(Object.keys(
      inputs
    ).reduce((accu, key) => ({ ...accu, [key]: inputs[key] }), {}) as ReturnType<typeof inputs>);
    return encodedInputData;
  };

  private getToAddress = () => {
    return networkConfigs.main.public.reverse;
  };

  private updateTxFields = () => {
    const toAddress = this.getToAddress();
    const value = '0';
    const gasLimit = '46818';
    this.props.setToField({
      raw: toAddress,
      value: Address(toAddress)
    });
    this.props.setValueField({
      raw: value,
      value: Wei(value)
    });
    this.props.inputData(this.buildTxData());
    this.props.inputGasLimit(gasLimit);
  };

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
          this.updateTxFields();
        }
      );
    }
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
    if (txFields.to === this.getToAddress() && txFields.data === this.buildTxData()) {
      return true;
    }
    return false;
  };

  private setNameComplete = () => {
    this.handleNotifications();
    this.setState(
      {
        setNameButtonClicked: false,
        initialPollRequested: false
      },
      () => {
        this.refreshAddressResolution();
        this.props.resetTransactionRequested();
        this.props.getNonceRequested();
      }
    );
  };

  private refreshAddressResolution = () => {
    const { address } = this.props;
    if (!this.props.networkConfig.isTestnet) {
      this.props.reverseResolveAddressRequested(address, true);
    }
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

  private cancelModal = () => {
    this.closeModal(true);
  };

  private closeModal = (closedByUser: boolean) => {
    this.setState({
      showModal: false,
      setNameButtonClicked: !closedByUser
    });
  };

  private pollForHash = () => {
    setTimeout(this.getTxStatus, 10000);
  };

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
    wallet: walletSelectors.getWalletInst(state),
    txNetworkFields: state.transaction.network,
    notifications: state.notifications,
    addressRequests: state.ens.addressRequests,
    txState: state.transactions.txData,
    networkConfig: configSelectors.getNetworkConfig(state),
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
  reverseResolveAddressRequested: ensActions.reverseResolveAddressRequested,
  setToField: transactionFieldsActions.setToField,
  setValueField: transactionFieldsActions.setValueField,
  inputData: transactionFieldsActions.inputData,
  inputGasLimit: transactionFieldsActions.inputGasLimit,
  getNonceRequested: transactionNetworkActions.getNonceRequested,
  resetTransactionRequested: transactionFieldsActions.resetTransactionRequested,
  signTransactionRequested: transactionSignActions.signTransactionRequested,
  fetchTransactionData: transactionsActions.fetchTransactionData
};

export default connect(mapStateToProps, mapDispatchToProps)(AccountNameLabel);
