import React from 'react';
import { connect } from 'react-redux';
import EthTx from 'ethereumjs-tx';
import BN from 'bn.js';

import translate from 'translations';
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
import Contract from 'libs/contracts';
import ENS from 'libs/ens/contracts';
import networkConfigs from 'libs/ens/networkConfigs';
import { IBaseAddressRequest } from 'libs/ens';
import { Spinner } from 'components/ui';
import { Address } from 'libs/units';
import { notificationsActions } from 'features/notifications';
import { ConfirmationModal } from 'components/ConfirmationModal';

interface StateProps {
  wallet: AppState['wallet']['inst'];
  broadcast: AppState['transaction']['broadcast'];
  serializedTransaction: AppState['transaction']['sign']['web3']['transaction'];
  notifications: AppState['notifications'];
  indexingHash: AppState['transaction']['sign']['indexingHash'];
  txNetworkFields: AppState['transaction']['network'];
  addressRequests: AppState['ens']['addressRequests'];
  validGasPrice: boolean;
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
  resetTransactionRequested: transactionFieldsActions.TResetTransactionRequested;
  inputData: transactionFieldsActions.TInputData;
  setToField: transactionFieldsActions.TSetToField;
  setValueField: transactionFieldsActions.TSetValueField;
  getFromRequested: transactionNetworkActions.TGetFromRequested;
  getNonceRequested: transactionNetworkActions.TGetNonceRequested;
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
  labelMatchesPublicName: boolean | null;
  setNameButtonClicked: boolean;
  initialPollRequested: boolean;
  pollTimeout: boolean;
  txRepairMode: boolean;
}

class AccountNameStatus extends React.Component<Props, State> {
  public state = {
    reverseRegistrarInstance: ENS.reverse,
    showModal: false,
    hover: false,
    labelMatchesPublicName: null,
    setNameButtonClicked: false,
    initialPollRequested: false,
    pollTimeout: false,
    txRepairMode: false
  };

  public render() {
    const { signaturePending, signedTx } = this.props;
    const { showModal } = this.state;
    const accountNameButton = this.generateAccountNameButton();

    return (
      <div className="AccountNameStatus">
        <div
          className="help-block"
          onMouseEnter={this.handleHover}
          onMouseLeave={this.handleNoHover}
          style={{ marginBottom: 2 }}
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
      broadcast,
      addressLabel,
      txState,
      purchasedSubdomainLabel,
      addressRequest,
      isFullTransaction,
      validGasPrice,
      validGasLimit,
      networkRequestPending,
      indexingHash,
      txNetworkFields
    } = this.props;
    const { setNameButtonClicked, initialPollRequested, pollTimeout, txRepairMode } = this.state;
    if (purchasedSubdomainLabel !== prevProps.purchasedSubdomainLabel) {
      if (!!purchasedSubdomainLabel) {
        const labelMatchesPublicName =
          purchasedSubdomainLabel === (addressRequest as IBaseAddressRequest).name;
        this.setState({ labelMatchesPublicName }, () => {
          setTimeout(this.makeTx, 1000);
        });
      }
    }
    if (addressLabel !== prevProps.addressLabel || addressRequest !== prevProps.addressRequest) {
      if (!!addressRequest) {
        const labelMatchesPublicName = !!purchasedSubdomainLabel
          ? purchasedSubdomainLabel === (addressRequest as IBaseAddressRequest).name
          : addressLabel === (addressRequest as IBaseAddressRequest).name;
        this.setState({ labelMatchesPublicName });
      }
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
        setNameButtonClicked &&
        !initialPollRequested &&
        !!indexingHash &&
        !!(broadcast as any)[indexingHash as string] &&
        (broadcast as any)[indexingHash as string].broadcastSuccessful
      ) {
        this.setState({ initialPollRequested: true });
        this.pollForHash();
        this.handleNoHover();
      }
    }
    if (txState !== prevProps.txState) {
      if (
        setNameButtonClicked &&
        initialPollRequested &&
        !!txState &&
        !!txState[(broadcast as any)[indexingHash as string].broadcastedHash as string].receipt &&
        !!(txState[(broadcast as any)[indexingHash as string].broadcastedHash as string]
          .receipt as TransactionReceipt).status &&
        !!(txState[(broadcast as any)[indexingHash as string].broadcastedHash as string]
          .receipt as TransactionReceipt).status === true
      ) {
        this.setNameComplete();
      } else if (!pollTimeout) {
        this.setState({ pollTimeout: true });
        this.pollForHash();
      }
    }
  }

  private generateAccountNameButton = () => {
    const { hover, setNameButtonClicked, labelMatchesPublicName } = this.state;
    const { addressLabel, purchasedSubdomainLabel, addressRequest } = this.props;
    if (!addressRequest) {
      return null;
    }
    let divClassName = 'help-block is-valid AccountInfo-address-addr--small';
    let iconClassName = 'fa fa-check';
    let spanRole = '';
    let spanClassName = '';
    let title = translate('ENS_REVERSE_RESOLVE_NAME_PUBLIC');
    let nameToSet = !!purchasedSubdomainLabel ? purchasedSubdomainLabel : addressLabel;
    let spinner = null;
    const reverseResolvedNameNotNull = !!addressRequest
      ? (addressRequest as IBaseAddressRequest).name
      : '';

    if (!labelMatchesPublicName) {
      if (setNameButtonClicked) {
        spinner = <Spinner />;
        iconClassName = '';
        divClassName = 'help-block is-semivalid';
        spanClassName = 'AccountInfo-address-addr--small';
        if (this.props.transactionBroadcasted) {
          title = translate('ETHSIMPLE_STATUS_WAIT_FOR_MINE');
        } else {
          title = translate('ETHSIMPLE_STATUS_WAIT_FOR_USER_CONFIRM');
        }
      } else if (hover) {
        spanRole = 'button';
        title = translate('ENS_REVERSE_RESOLVE_UPDATE_NAME', {
          $addressLabel: nameToSet
        });
      } else {
        divClassName = 'help-block is-invalid';
        iconClassName = '';
        spanRole = 'button';
        spanClassName = 'AccountInfo-address-addr--small';
        title =
          reverseResolvedNameNotNull === ''
            ? translate('ENS_REVERSE_RESOLVE_NAME_EMPTY')
            : translate('ENS_REVERSE_RESOLVE_MISMATCH', {
                $addressLabel: nameToSet,
                $accountName: reverseResolvedNameNotNull
              });
      }
    }

    return (
      <React.Fragment>
        <div className={divClassName} style={{ marginBottom: 0 }}>
          <i className={iconClassName} />
          <span role={spanRole} onClick={this.setName} className={spanClassName}>
            {spinner}
            {title}
          </span>
        </div>
      </React.Fragment>
    );
  };

  private handleHover = () => {
    if (!this.state.labelMatchesPublicName && !this.state.setNameButtonClicked) {
      this.makeTx();
      this.setState({ hover: true });
    }
  };

  private handleNoHover = () => {
    this.setState({ hover: false });
  };

  private makeTx = () => {
    let nameToSet = !!this.props.purchasedSubdomainLabel
      ? this.props.purchasedSubdomainLabel
      : this.props.addressLabel;
    const inputs = { name: nameToSet } as any;
    const encodedInputData = this.state.reverseRegistrarInstance.setName.encodeInput(Object.keys(
      inputs
    ).reduce((accu, key) => ({ ...accu, [key]: inputs[key] }), {}) as ReturnType<typeof inputs>);

    const toField = networkConfigs.main.public.reverse;
    const valueField = '0';

    this.props.setToField({
      raw: toField,
      value: Address(toField)
    });
    this.props.setValueField({
      raw: valueField,
      value: new BN(valueField)
    });
    this.props.inputData(encodedInputData);
  };

  private setName = (ev: React.FormEvent<HTMLElement>) => {
    ev.preventDefault();
    this.verifyTx();
  };

  private verifyTx = () => {
    if (this.checkNetworkFields()) {
      this.setState(
        {
          setNameButtonClicked: true,
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
        this.makeTx();
      }
      if (txNetworkFields.getFromStatus !== success) {
        this.props.getFromRequested();
      }
      if (txNetworkFields.getNonceStatus !== success) {
        this.props.getNonceRequested();
      }
    });
  };

  private setNameComplete = () => {
    const { address } = this.props;
    this.props.getNonceRequested();
    this.manageNotifications();
    this.setState({
      setNameButtonClicked: false,
      initialPollRequested: false
    });
    if (!this.props.networkConfig.isTestnet) {
      this.props.reverseResolveAddressRequested(address, true);
    }
  };

  private manageNotifications = () => {
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
    this.props.showNotification('success', 'Your public account name has been updated!', 10000);
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
    this.setState({ pollTimeout: false });
    const { broadcast, indexingHash } = this.props;
    if (
      this.state.setNameButtonClicked &&
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
    wallet: walletSelectors.getWalletInst(state),
    broadcast: state.transaction.broadcast,
    txNetworkFields: state.transaction.network,
    notifications: state.notifications,
    addressRequests: state.ens.addressRequests,
    indexingHash: state.transaction.sign.indexingHash,
    serializedTransaction: derivedSelectors.getSerializedTransaction(state),
    txState: state.transactions.txData,
    networkConfig: configSelectors.getNetworkConfig(state),
    ...derivedSelectors.getTransaction(state),
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
  showNotification: notificationsActions.showNotification,
  closeNotification: notificationsActions.closeNotification,
  reverseResolveAddressRequested: ensActions.reverseResolveAddressRequested,
  resetTransactionRequested: transactionFieldsActions.resetTransactionRequested,
  inputData: transactionFieldsActions.inputData,
  setValueField: transactionFieldsActions.setValueField,
  setToField: transactionFieldsActions.setToField,
  getFromRequested: transactionNetworkActions.getFromRequested,
  getNonceRequested: transactionNetworkActions.getNonceRequested,
  signTransactionRequested: transactionSignActions.signTransactionRequested,
  fetchTransactionData: transactionsActions.fetchTransactionData
};

export default connect(mapStateToProps, mapDispatchToProps)(AccountNameStatus);
