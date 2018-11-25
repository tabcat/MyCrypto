import React from 'react';
import { connect, MapStateToProps } from 'react-redux';
import { CopyToClipboard } from 'react-copy-to-clipboard';

import translate, { translateRaw } from 'translations';
import { AppState } from 'features/reducers';
import {
  addressBookConstants,
  addressBookActions,
  addressBookSelectors
} from 'features/addressBook';
import { configSelectors } from 'features/config';
import { ensActions } from 'features/ens';
import { IBaseAddressRequest } from 'libs/ens';
import { Address, Identicon, Input } from 'components/ui';
import AccountNameStatus from './AccountNameStatus';

interface StateProps {
  entry: ReturnType<typeof addressBookSelectors.getAccountAddressEntry>;
  addressRequests: AppState['ens']['addressRequests'];
  networkConfig: ReturnType<typeof configSelectors.getNetworkConfig>;
  addressLabel: string;
}

interface DispatchProps {
  reverseResolveAddressRequested: ensActions.TReverseResolveAddressRequested;
  changeAddressLabelEntry: addressBookActions.TChangeAddressLabelEntry;
  saveAddressLabelEntry: addressBookActions.TSaveAddressLabelEntry;
  removeAddressLabelEntry: addressBookActions.TRemoveAddressLabelEntry;
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
  addressLabel: string;
  addressRequest: IBaseAddressRequest | null;
  reverseResolvedNameExists: boolean | null;
}

class AccountAddress extends React.Component<Props, State> {
  public state = {
    copied: false,
    editingLabel: false,
    labelInputTouched: false,
    addressLabel: '',
    addressRequest: null,
    reverseResolvedNameExists: false
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
    const { address, addressLabel, addressRequests } = this.props;
    if (address !== prevProps.address && !this.props.networkConfig.isTestnet) {
      this.props.reverseResolveAddressRequested(address, false);
    }
    if (addressRequests !== prevProps.addressRequests) {
      const req = addressRequests[address];
      if (!!req.data) {
        this.setState({
          addressRequest: req.data,
          reverseResolvedNameExists: req.data.name.length > 0
        });
      }
    }
    if (addressLabel !== prevProps.addressLabel) {
      this.setState({ addressLabel: addressLabel });
    }
  }

  public render() {
    const { address, addressLabel, purchasedSubdomainLabel } = this.props;
    const { copied, reverseResolvedNameExists } = this.state;
    const labelContent =
      reverseResolvedNameExists || !!purchasedSubdomainLabel
        ? this.generateAccountNameLabel()
        : this.generateLabelContent();
    const labelButton = this.generateLabelButton();
    const addressClassName = `AccountInfo-address-addr ${
      addressLabel || reverseResolvedNameExists || !!purchasedSubdomainLabel
        ? 'AccountInfo-address-addr--small'
        : ''
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
            {!reverseResolvedNameExists && (
              <div className="AccountInfo-label" title={translateRaw('EDIT_LABEL_2')}>
                {labelButton}
              </div>
            )}
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
    const { addressLabel, entry: { temporaryLabel, labelError } } = this.props; // , networkConfig
    const { editingLabel, labelInputTouched } = this.state;
    const newLabelSameAsPrevious = temporaryLabel === addressLabel;
    const labelInputTouchedWithError = labelInputTouched && !newLabelSameAsPrevious && labelError;
    // const accountNameStatus = networkConfig.isTestnet ? null : this.generateAccountNameStatus();

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
          {addressLabel.length > 0 && (
            <label className="AccountInfo-address-label">{addressLabel}</label>
          )}
        </React.Fragment>
      );
    }

    return labelContent;
  };

  private generateAccountNameLabel = () => {
    const { address, purchasedSubdomainLabel } = this.props;
    const { addressLabel, addressRequest } = this.state;
    return (
      <React.Fragment>
        <AccountNameStatus
          address={address}
          addressLabel={addressLabel}
          purchasedSubdomainLabel={purchasedSubdomainLabel}
          addressRequest={addressRequest}
        />
      </React.Fragment>
    );
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
    addressLabel: labelEntry ? labelEntry.label : ''
  };
};

const mapDispatchToProps: DispatchProps = {
  reverseResolveAddressRequested: ensActions.reverseResolveAddressRequested,
  changeAddressLabelEntry: addressBookActions.changeAddressLabelEntry,
  saveAddressLabelEntry: addressBookActions.saveAddressLabelEntry,
  removeAddressLabelEntry: addressBookActions.removeAddressLabelEntry
};

export default connect<StateProps, DispatchProps, OwnProps, AppState>(
  mapStateToProps,
  mapDispatchToProps
)(AccountAddress);
