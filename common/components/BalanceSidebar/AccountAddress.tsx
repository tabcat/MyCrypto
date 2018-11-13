import React from 'react';
import { connect, MapStateToProps } from 'react-redux';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import EthTx from 'ethereumjs-tx';

import translate, { translateRaw } from 'translations';
import * as derivedSelectors from 'features/selectors';
import { AppState } from 'features/reducers';
import {
  addressBookConstants,
  addressBookActions,
  addressBookSelectors
} from 'features/addressBook';
import { configSelectors } from 'features/config';
import {
  transactionFieldsActions,
  transactionNetworkActions,
  transactionSignActions,
  transactionSelectors,
  transactionBroadcastTypes,
  transactionSignSelectors
} from 'features/transaction';
import { ensActions } from 'features/ens';
import Contract from 'libs/contracts';
import ENS from 'libs/ens/contracts';
import { IBaseAddressRequest } from 'libs/ens';
import { Address, Identicon, Input } from 'components/ui';
import { Address as AddressTx, Wei } from 'libs/units';
import { notificationsActions } from 'features/notifications';
import { ConfirmationModal } from 'components/ConfirmationModal';

interface StateProps {
  entry: ReturnType<typeof addressBookSelectors.getAccountAddressEntry>;
  currentTransaction: false | transactionBroadcastTypes.ITransactionStatus | null;
  addressRequests: AppState['ens']['addressRequests'];
  networkConfig: ReturnType<typeof configSelectors.getNetworkConfig>;
  addressLabel: string;
  transaction: EthTx;
  isFullTransaction: boolean;
  transactionBroadcasted: boolean | null;
  signaturePending: boolean;
  signedTx: boolean;
}

interface DispatchProps {
  reverseResolveAddressRequested: ensActions.TReverseResolveAddressRequested;
  changeAddressLabelEntry: addressBookActions.TChangeAddressLabelEntry;
  saveAddressLabelEntry: addressBookActions.TSaveAddressLabelEntry;
  removeAddressLabelEntry: addressBookActions.TRemoveAddressLabelEntry;
  resetTransactionRequested: transactionFieldsActions.TResetTransactionRequested;
  inputData: transactionFieldsActions.TInputData;
  setToField: transactionFieldsActions.TSetToField;
  setValueField: transactionFieldsActions.TSetValueField;
  inputGasLimit: transactionFieldsActions.TInputGasLimit;
  inputGasPrice: transactionFieldsActions.TInputGasPrice;
  getFromRequested: transactionNetworkActions.TGetFromRequested;
  getNonceRequested: transactionNetworkActions.TGetNonceRequested;
  signTransactionRequested: transactionSignActions.TSignTransactionRequested;
  showNotification: notificationsActions.TShowNotification;
}

interface OwnProps {
  address: string;
  purchasedSubdomainLabel: string | null;
}

type Props = StateProps & DispatchProps & OwnProps;

interface State {
  copied: boolean;
  editingLabel: boolean;
  labelInputTouched: boolean;
  reverseRegistrarInstance: Contract;
  showModal: boolean;
  hover: boolean;
  reverseResolvedName: string;
  labelMatchesReverseResolvedName: boolean;
}

class AccountAddress extends React.Component<Props, State> {
  public state = {
    copied: false,
    editingLabel: false,
    labelInputTouched: false,
    reverseRegistrarInstance: ENS.reverse,
    showModal: false,
    hover: false,
    reverseResolvedName: '',
    labelMatchesReverseResolvedName: true
  };

  private goingToClearCopied: number | null = null;

  private labelInput: HTMLInputElement | null = null;

  public handleCopy = () =>
    this.setState(
      (prevState: State) => ({
        copied: !prevState.copied
      }),
      this.clearCopied
    );

  public componentWillUnmount() {
    if (this.goingToClearCopied) {
      window.clearTimeout(this.goingToClearCopied);
    }
  }

  public componentDidUpdate(prevProps: Props) {
    const { address, addressRequests, purchasedSubdomainLabel, addressLabel } = this.props;
    if (address !== prevProps.address) {
      this.props.reverseResolveAddressRequested(address);
    }
    if (addressRequests !== prevProps.addressRequests) {
      const req = addressRequests[address];
      if (!!req && !req.error && req.data && (req.data as IBaseAddressRequest).name) {
        const reverseResolvedName = (req.data as IBaseAddressRequest).name;
        const labelMatchesReverseResolvedName = reverseResolvedName === addressLabel;
        if (reverseResolvedName.length > 0) {
          this.setState({
            reverseResolvedName,
            labelMatchesReverseResolvedName
          });
        }
      }
    }
    if (purchasedSubdomainLabel !== prevProps.purchasedSubdomainLabel) {
      if (!!purchasedSubdomainLabel) {
        this.setState({ labelMatchesReverseResolvedName: false });
      }
    }
    if (addressLabel !== prevProps.addressLabel) {
      const labelMatchesReverseResolvedName = addressLabel == this.state.reverseResolvedName;
      this.setState({ labelMatchesReverseResolvedName });
    }
  }

  public render() {
    const { address, addressLabel, signaturePending, signedTx } = this.props;
    const { copied, showModal } = this.state;
    const labelContent = this.generateLabelContent();
    const labelButton = this.generateLabelButton();
    const addressClassName = `AccountInfo-address-addr ${
      addressLabel ? 'AccountInfo-address-addr--small' : ''
    }`;

    return (
      <div className="AccountInfo">
        <h5 className="AccountInfo-section-header">{translate('SIDEBAR_ACCOUNTADDR')}</h5>
        <div className="AccountInfo-section AccountInfo-address-section">
          <div className="AccountInfo-address-icon">
            <Identicon address={address} size="100%" />
          </div>
          <div className="AccountInfo-address-wrapper">
            {labelContent}
            <div className={addressClassName}>
              <Address address={address} />
            </div>
            <CopyToClipboard onCopy={this.handleCopy} text={address}>
              <div
                className={`AccountInfo-copy ${copied ? 'is-copied' : ''}`}
                title={translateRaw('COPY_TO_CLIPBOARD')}
              >
                <i className="fa fa-copy" />
                <span>{translateRaw(copied ? 'COPIED' : 'COPY_ADDRESS')}</span>
              </div>
            </CopyToClipboard>
            <div className="AccountInfo-label" title={translateRaw('EDIT_LABEL_2')}>
              {labelButton}
            </div>
            <React.Fragment>
              <ConfirmationModal
                isOpen={!signaturePending && signedTx && showModal}
                onClose={this.closeModal}
              />
            </React.Fragment>
          </div>
        </div>
      </div>
    );
  }

  private clearCopied = () =>
    (this.goingToClearCopied = window.setTimeout(() => this.setState({ copied: false }), 2000));

  private startEditingLabel = () =>
    this.setState({ editingLabel: true }, () => {
      if (this.labelInput) {
        this.labelInput.focus();
        this.labelInput.select();
      }
    });

  private stopEditingLabel = () => this.setState({ editingLabel: false });

  private setLabelInputRef = (node: HTMLInputElement) => (this.labelInput = node);

  private generateLabelContent = () => {
    const { addressLabel, entry: { temporaryLabel, labelError } } = this.props;
    const { editingLabel, labelInputTouched } = this.state;
    const newLabelSameAsPrevious = temporaryLabel === addressLabel;
    const labelInputTouchedWithError = labelInputTouched && !newLabelSameAsPrevious && labelError;

    let labelContent = null;

    if (editingLabel) {
      labelContent = (
        <React.Fragment>
          <Input
            title={translateRaw('ADD_LABEL')}
            placeholder={translateRaw('NEW_LABEL')}
            defaultValue={addressLabel}
            onChange={this.handleLabelChange}
            onKeyDown={this.handleKeyDown}
            onFocus={this.setTemporaryLabelTouched}
            onBlur={this.handleBlur}
            showInvalidBeforeBlur={true}
            setInnerRef={this.setLabelInputRef}
            isValid={!labelInputTouchedWithError}
          />
          {labelInputTouchedWithError && (
            <label className="AccountInfo-address-wrapper-error">{labelError}</label>
          )}
        </React.Fragment>
      );
    } else {
      labelContent = (
        <React.Fragment>
          <div
            className="help-block"
            onMouseEnter={this.handleHover}
            onMouseLeave={this.handleNoHover}
            style={{ marginBottom: 2 }}
          >
            {this.setToPublicButton()}
          </div>
          {addressLabel.length > 0 && (
            <label className="AccountInfo-address-label">{addressLabel}</label>
          )}
        </React.Fragment>
      );
    }

    return labelContent;
  };

  private setToPublicButton = () => {
    const { reverseResolvedName, labelMatchesReverseResolvedName, hover } = this.state;
    const { addressLabel } = this.props;
    return addressLabel.length === 0 ||
      this.props.networkConfig.isTestnet ? null : labelMatchesReverseResolvedName ? (
      <React.Fragment>
        <div
          className="help-block is-valid AccountInfo-address-addr--small"
          style={{ marginBottom: 0 }}
        >
          <i className="fa fa-check" />
          <span
            role=""
            title={` Account name '${reverseResolvedName}' is public`} // "ENS_REVERSE_RESOLVE_ACCOUNT_PUBLIC": "Account name '$accountName' is public",
            onClick={this.setReverseResolveName}
          >
            {` Account name is public`}
          </span>
        </div>
      </React.Fragment>
    ) : hover ? ( // // "ENS_REVERSE_RESOLVE_ACCOUNT_PUBLIC_SHORT": " Account name is public",
      <React.Fragment>
        <div
          className="help-block is-valid AccountInfo-address-addr--small"
          style={{ marginBottom: 0 }}
        >
          <i className="fa fa-check" />
          <span
            role="button"
            title={`Update public account name to '${addressLabel}'`} // "ENS_REVERSE_RESOLVE_UPDATE_ACCOUNT": " Update public account name to '$addressLabel",
            onClick={this.setReverseResolveName}
          >
            {` Update public account name to '${addressLabel}'`}
          </span>
        </div>
      </React.Fragment>
    ) : (
      <React.Fragment>
        <div className="help-block is-invalid" style={{ marginBottom: 0 }}>
          <i className="fa fa-remove" />
          <span
            role="button"
            title={`Public account name does not match '${addressLabel}'`} // "ENS_REVERSE_RESOLVE_MISMATCH": " Public account name does not match $addressLabel",
            onClick={this.setReverseResolveName}
            className="AccountInfo-address-addr--small"
          >
            {` Public account name does not match '${addressLabel}'`}
          </span>
        </div>
      </React.Fragment>
    );
  };

  private handleHover = () => {
    if (!this.state.labelMatchesReverseResolvedName) {
      this.setState({ hover: true });
    }
  };

  private handleNoHover = () => {
    this.setState({ hover: false });
  };

  private generateLabelButton = () => {
    const { addressLabel } = this.props;
    const { editingLabel } = this.state;
    const labelButton = editingLabel ? (
      <React.Fragment>
        <i className="fa fa-save" />
        <span role="button" title={translateRaw('SAVE_LABEL')} onClick={this.stopEditingLabel}>
          {translate('SAVE_LABEL')}
        </span>
      </React.Fragment>
    ) : (
      <React.Fragment>
        <i className="fa fa-pencil" />
        <span
          role="button"
          title={addressLabel ? translateRaw('EDIT_LABEL') : translateRaw('ADD_LABEL_9')}
          onClick={this.startEditingLabel}
        >
          {addressLabel ? translate('EDIT_LABEL') : translate('ADD_LABEL_9')}
        </span>
      </React.Fragment>
    );

    return labelButton;
  };

  private setReverseResolveName = (ev: React.FormEvent<HTMLElement>) => {
    ev.preventDefault();
    this.props.getFromRequested();
    this.props.getNonceRequested();
    const nameToSet = this.props.addressLabel;
    const inputs = {
      name: nameToSet
    } as any;
    const encodedInputData = this.state.reverseRegistrarInstance.setName.encodeInput(Object.keys(
      inputs
    ).reduce((accu, key) => ({ ...accu, [key]: inputs[key] }), {}) as ReturnType<typeof inputs>);
    this.props.inputData(encodedInputData);
    this.props.setToField({
      raw: '0x9062c0a6dbd6108336bcbe4593a3d1ce05512069',
      value: AddressTx('0x9062c0a6dbd6108336bcbe4593a3d1ce05512069')
    });
    this.props.setValueField({
      raw: '0',
      value: Wei('0')
    });
    this.props.inputGasPrice('5');
    this.props.inputGasLimit('50000');
    setTimeout(this.reverseResolveTx, 3000);
  };

  private reverseResolveTx = () => {
    console.log('reverseResolveTx');
    this.props.signTransactionRequested(this.props.transaction);
    this.openModal();
  };

  private handleBlur = () => {
    const { address, addressLabel, entry: { id, label, temporaryLabel, labelError } } = this.props;

    this.clearTemporaryLabelTouched();
    this.stopEditingLabel();

    if (temporaryLabel === addressLabel) {
      return;
    }

    if (temporaryLabel && temporaryLabel.length > 0) {
      this.props.saveAddressLabelEntry(id);

      if (labelError) {
        // If the new changes aren't valid, undo them.
        this.props.changeAddressLabelEntry({
          id,
          address,
          temporaryAddress: address,
          label,
          temporaryLabel: label,
          overrideValidation: true
        });
      }
    } else {
      this.props.removeAddressLabelEntry(id);
    }
  };

  private handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Enter':
        return this.handleBlur();
      case 'Escape':
        return this.stopEditingLabel();
    }
  };

  private handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { address } = this.props;
    const label = e.target.value;

    this.props.changeAddressLabelEntry({
      id: addressBookConstants.ACCOUNT_ADDRESS_ID,
      address,
      label,
      isEditing: true
    });

    this.setState(
      {
        labelInputTouched: true
      },
      () => label.length === 0 && this.clearTemporaryLabelTouched()
    );
  };

  private setTemporaryLabelTouched = () => {
    const { labelInputTouched } = this.state;

    if (!labelInputTouched) {
      this.setState({ labelInputTouched: true });
    }
  };

  private clearTemporaryLabelTouched = () => this.setState({ labelInputTouched: false });

  public UNSAFE_componentWillReceiveProps(nextProps: Props) {
    if (nextProps.transactionBroadcasted && this.state.showModal) {
      this.closeModal();
    }
  }

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

  private closeModal = () => this.setState({ showModal: false });
}

const mapStateToProps: MapStateToProps<StateProps, {}, AppState> = (
  state: AppState,
  ownProps: OwnProps
) => {
  const labelEntry = addressBookSelectors.getAddressLabelEntryFromAddress(state, ownProps.address);
  return {
    addressRequests: state.ens.addressRequests,
    networkConfig: configSelectors.getNetworkConfig(state),
    entry: addressBookSelectors.getAccountAddressEntry(state),
    addressLabel: labelEntry ? labelEntry.label : '',
    ...derivedSelectors.getTransaction(state),
    currentTransaction: transactionSelectors.getCurrentTransactionStatus(state),
    transactionBroadcasted: transactionSelectors.currentTransactionBroadcasted(state),
    signaturePending: derivedSelectors.signaturePending(state).isSignaturePending,
    signedTx:
      !!transactionSignSelectors.getSignedTx(state) || !!transactionSignSelectors.getWeb3Tx(state)
  };
};

const mapDispatchToProps: DispatchProps = {
  reverseResolveAddressRequested: ensActions.reverseResolveAddressRequested,
  changeAddressLabelEntry: addressBookActions.changeAddressLabelEntry,
  saveAddressLabelEntry: addressBookActions.saveAddressLabelEntry,
  removeAddressLabelEntry: addressBookActions.removeAddressLabelEntry,
  resetTransactionRequested: transactionFieldsActions.resetTransactionRequested,
  inputData: transactionFieldsActions.inputData,
  setValueField: transactionFieldsActions.setValueField,
  setToField: transactionFieldsActions.setToField,
  inputGasPrice: transactionFieldsActions.inputGasPrice,
  inputGasLimit: transactionFieldsActions.inputGasLimit,
  getFromRequested: transactionNetworkActions.getFromRequested,
  getNonceRequested: transactionNetworkActions.getNonceRequested,
  signTransactionRequested: transactionSignActions.signTransactionRequested,
  showNotification: notificationsActions.showNotification
};

export default connect<StateProps, DispatchProps, OwnProps, AppState>(
  mapStateToProps,
  mapDispatchToProps
)(AccountAddress);
