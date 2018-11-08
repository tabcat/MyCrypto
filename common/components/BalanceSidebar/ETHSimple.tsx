import React, { Component } from 'react';
import { connect } from 'react-redux';
import Markdown from 'react-markdown';
import { sha3, bufferToHex } from 'ethereumjs-util';
import BN from 'bn.js';
import { translate, translateRaw } from 'translations';
import { TransactionState } from 'types/transactions';
import { AppState } from 'features/reducers';
import { ensActions } from 'features/ens';
import { walletSelectors } from 'features/wallet';
import { configSelectors, configMetaSelectors } from 'features/config';
import { notificationsActions } from 'features/notifications';
import {
  transactionFieldsActions,
  transactionNetworkActions,
  transactionSelectors
} from 'features/transaction';
import { transactionsActions } from 'features/transactions';
import { isValidENSAddress } from 'libs/validators';
import { NameState, getNameHash } from 'libs/ens';
import Contract from 'libs/contracts';
import { Address, Wei } from 'libs/units';
import { Input, NewTabLink, Spinner } from 'components/ui';
import { ConfirmationModal } from 'components/ConfirmationModal';
import { SendButtonFactory } from 'components/SendButtonFactory';
import './ETHSimple.scss';
const constants = require('./ETHSimpleConstants.json');

interface State {
  isValidDomain: boolean;
  isAvailableDomain: boolean;
  isFocused: boolean;
  isResolving: boolean;
  isLoading: boolean;
  purchaseClicked: boolean;
  initialPollRequested: boolean;
  pollTimeout: boolean;
  recentlyPurchased: boolean;
  subdomain: string;
  domainToCheck: string;
  description: string;
}

interface StateProps {
  domainRequests: AppState['ens']['domainRequests'];
  broadcast: AppState['transaction']['broadcast'];
  indexingHash: AppState['transaction']['sign']['indexingHash'];
  wallet: AppState['wallet']['inst'];
  isOffline: ReturnType<typeof configMetaSelectors.getOffline>;
  networkConfig: ReturnType<typeof configSelectors.getNetworkConfig>;
  tx: TransactionState | null;
  transactionBroadcasted: boolean | null;
}

interface DispatchProps {
  resolveDomainRequested: ensActions.TResolveDomainRequested;
  clearDomain: ensActions.TResolveDomainFailed;
  showNotification: notificationsActions.TShowNotification;
  closeNotification: notificationsActions.TCloseNotification;
  setToField: transactionFieldsActions.TSetToField;
  setValueField: transactionFieldsActions.TSetValueField;
  inputData: transactionFieldsActions.TInputData;
  inputGasLimit: transactionFieldsActions.TInputGasLimit;
  inputGasPrice: transactionFieldsActions.TInputGasPrice;
  getFromRequested: transactionNetworkActions.TGetFromRequested;
  getNonceRequested: transactionNetworkActions.TGetNonceRequested;
  resetTransactionRequested: transactionFieldsActions.TResetTransactionRequested;
  fetchTransactionData: transactionsActions.TFetchTransactionData;
}

type Props = StateProps & DispatchProps;

export class ETHSimpleClass extends Component<Props, State> {
  public initialState: State = {
    isFocused: false,
    isValidDomain: false,
    isAvailableDomain: false,
    isResolving: false,
    isLoading: false,
    purchaseClicked: false,
    initialPollRequested: false,
    pollTimeout: false,
    recentlyPurchased: false,
    subdomain: '',
    domainToCheck: '',
    description: this.buildDesc()
  };

  public state: State = this.initialState;

  private buildDesc() {
    let addr: string;
    if (this.props.wallet) addr = this.props.wallet.getAddressString();
    else addr = translateRaw('ETHSIMPLE_DESC_DEFAULT_NO_ADDR');
    return (
      translateRaw('ETHSIMPLE_DESC_0') +
      translateRaw('ETHSIMPLE_DESC_DEFAULT_SUBDOMAIN') +
      translateRaw('ETHSIMPLE_DESC_1') +
      '`' +
      addr.substring(0, 25) +
      '...`'
    );
  }

  public render() {
    const {
      isLoading,
      isValidDomain,
      isAvailableDomain,
      isResolving,
      purchaseClicked,
      subdomain,
      description,
      recentlyPurchased
    } = this.state;
    const validSubdomain = recentlyPurchased
      ? recentlyPurchased
      : !!subdomain && isValidDomain && isAvailableDomain;
    const purchaseDisabled = isResolving || !isAvailableDomain || purchaseClicked; // || this.props.isOffline
    const subdomainFieldDisabled = isLoading || purchaseClicked;

    return (
      <div className="ETHSimple">
        <h5 className="ETHSimple-title">{translate('ETHSIMPLE_TITLE')}</h5>
        <div className="ETHSimple-description">
          <Markdown
            escapeHtml={true}
            unwrapDisallowed={true}
            allowedTypes={['inlineCode']}
            renderers={{
              root: React.Fragment,
              link: NewTabLink
            }}
            source={description}
          />
        </div>
        <form className="ETHSimpleInput" onSubmit={this.onSubmit}>
          <div className="input-group-wrapper">
            <label className="input-group input-group-inline ETHSimpleInput-name">
              <Input
                value={subdomain}
                isValid={validSubdomain}
                className="border-rad-right-0"
                type="text"
                placeholder="mydomain"
                onChange={this.onChange}
                onFocus={this.onFocus}
                onBlur={this.onBlur}
                disabled={subdomainFieldDisabled}
              />
              <span className="input-group-addon">.ethsimple.eth</span>
            </label>
          </div>
          <SendButtonFactory
            signing={true}
            Modal={ConfirmationModal}
            withProps={({ disabled, signTx, openModal }) => (
              <button
                disabled={purchaseDisabled}
                className="ETHSimple-button btn btn-primary btn-block"
                onClick={() => {
                  signTx();
                  openModal();
                }}
              >
                {translate('ETHSIMPLE_ACTION')}
              </button>
            )}
          />
        </form>
        {subdomain &&
          !isValidDomain && (
            <span className="help-block is-invalid">
              {translate('ENS_SUBDOMAIN_INVALID_INPUT')}
            </span>
          )}
        {subdomain &&
          !purchaseClicked &&
          !isResolving &&
          !isAvailableDomain &&
          isValidDomain &&
          !recentlyPurchased && (
            <span className="help-block is-invalid">
              Domain is unavailable <i className="fa fa-remove" />
            </span>
          )}
        {subdomain &&
          !purchaseClicked &&
          !isResolving &&
          isAvailableDomain &&
          isValidDomain && (
            <span className="help-block is-valid">
              Domain is available <i className="fa fa-check" />
            </span>
          )}
        {subdomain &&
          purchaseClicked &&
          !this.props.transactionBroadcasted && (
            <span className="help-block is-semivalid">
              Waiting for transaction to be signed <Spinner />
            </span>
          )}
        {subdomain &&
          purchaseClicked &&
          this.props.transactionBroadcasted && (
            <span className="help-block is-semivalid">
              Waiting for transaction to be confirmed <Spinner />
            </span>
          )}
        {subdomain &&
          !purchaseClicked &&
          !isAvailableDomain &&
          recentlyPurchased && (
            <span className="help-block is-valid">
              You own this domain <i className="fa fa-check" />
            </span>
          )}
        <div className="row">
          <div className="col-xs-12">
            <a
              href="https://ethsimple.com"
              target="_blank"
              rel="noopener noreferrer"
              className="ETHSimple-logo"
            />
          </div>
        </div>
      </div>
    );
  }

  public componentWillMount() {
    if (!this.props.isOffline && !this.state.purchaseClicked) {
      // this.props.resetTransactionRequested();
    }
  }

  public componentDidMount() {
    if (!this.props.isOffline && !this.state.purchaseClicked) {
      this.props.resetTransactionRequested();
      this.props.getNonceRequested();
      this.props.getFromRequested();
    }
  }

  componentDidUpdate(prevProps: Props) {
    const { domainRequests, broadcast, indexingHash, tx } = this.props;
    if (domainRequests !== prevProps.domainRequests) {
      const { domainToCheck } = this.state;
      const req = domainRequests[domainToCheck]; // get data for current domain
      const isResolving = req && !req.data && !req.error; // if no data and no error then the lookup is still processing
      const isAvailableDomain =
        !isResolving && req && req.data && !req.error && req.data.mode !== NameState.Open // domain is available if resolving has completed, the domain request has data,
          ? false
          : true;
      this.setState({
        isResolving,
        isAvailableDomain
      });
    }
    if (
      broadcast !== prevProps.broadcast &&
      this.state.purchaseClicked &&
      !this.state.initialPollRequested
    ) {
      if (indexingHash && broadcast[indexingHash]) {
        if (broadcast[indexingHash].broadcastSuccessful) {
          this.setState({ initialPollRequested: true });
          this.pollForHash();
        }
      }
    }
    if (this.state.purchaseClicked && indexingHash && broadcast[indexingHash]) {
      if (broadcast[indexingHash].broadcastSuccessful) {
        if (tx !== prevProps.tx && tx && tx[broadcast[indexingHash].broadcastedHash].data) {
          this.props.resetTransactionRequested();
          this.props.getNonceRequested();
          this.props.getFromRequested();
          this.props.clearDomain(this.state.domainToCheck, {
            name: 'error',
            message: 'clear domain'
          });
          this.props.resolveDomainRequested(this.state.domainToCheck);
          this.props.showNotification(
            // this.props.closeNotification();
            'success',
            `Your purchase of ${this.state.subdomain + '.' + constants.domain} has been confirmed!`,
            5000
          );
          this.setState({
            isAvailableDomain: false,
            purchaseClicked: false,
            recentlyPurchased: true
          });
        } else if (!this.state.pollTimeout) {
          this.setState({ pollTimeout: true });
          this.pollForHash();
        }
      }
    }
  }

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const subdomain = event.currentTarget.value.toLowerCase().trim();
    const domainToCheck = subdomain + (subdomain.length > 0 ? '.ethsimple' : '');
    const isValidDomain = isValidENSAddress(domainToCheck + '.eth');
    let isAvailableDomain = false;
    let purchaseClicked = false;
    let recentlyPurchased = false;
    let description = this.state.description;
    if (isValidDomain) {
      description = this.makeDescription(subdomain);
      this.props.resolveDomainRequested(domainToCheck); // if (!this.props.isOffline)
    }
    this.setState({
      subdomain,
      domainToCheck,
      isValidDomain,
      isAvailableDomain,
      description,
      purchaseClicked,
      recentlyPurchased
    });
    if (isValidDomain) this.buildTX(subdomain); //  && !this.props.isOffline
  };

  private onSubmit = (ev: React.FormEvent<HTMLElement>) => {
    ev.preventDefault();
    this.setState({ purchaseClicked: true });
  };

  private onFocus = () => this.setState({ isFocused: true });
  private onBlur = () => this.setState({ isFocused: false });

  private makeDescription = (domain: string) => {
    let addr: string;
    if (this.props.wallet) addr = this.props.wallet.getAddressString();
    else addr = translateRaw('ETHSIMPLE_DESC_DEFAULT_NO_ADDR');
    return (
      translateRaw('ETHSIMPLE_DESC_0') +
      (domain.length > 0 ? domain : translateRaw('ETHSIMPLE_DESC_DEFAULT_SUBDOMAIN')) +
      translateRaw('ETHSIMPLE_DESC_1') +
      '`' +
      addr.substring(0, 25) +
      '...`'
    );
  };

  private buildTX = (subdomain: string) => {
    if (this.props.wallet) {
      const { wallet, networkConfig } = this.props;
      let ethSimpleSubdomainRegistrarAddr;
      if (networkConfig.isTestnet)
        ethSimpleSubdomainRegistrarAddr = constants.subdomainRegistrarAddr.testnet;
      else ethSimpleSubdomainRegistrarAddr = constants.subdomainRegistrarAddr.mainnet;
      let ethSimpleSubdomainRegistrarInstance = new Contract(constants.subdomainRegistrarABI);
      let inputs = {
        _node: getNameHash(constants.domain),
        _label: bufferToHex(sha3(subdomain)),
        _newNode: getNameHash(subdomain + '.' + constants.domain),
        _resolver: bufferToHex(Address(constants.publicResolverAddr)),
        _owner: bufferToHex(Address(wallet.getAddressString())),
        _resolvedAddress: bufferToHex(Address(wallet.getAddressString())),
        _contentHash: constants.emptyContentHash
      };
      const parsedInputs = Object.keys(inputs).reduce(
        (accu, key) => ({ ...accu, [key]: inputs[key] }),
        {}
      );
      let encodedInputData = ethSimpleSubdomainRegistrarInstance.purchaseSubdomain.encodeInput(
        parsedInputs
      );
      this.props.setToField({
        raw: ethSimpleSubdomainRegistrarAddr,
        value: Address(ethSimpleSubdomainRegistrarAddr)
      });
      this.props.setValueField({
        raw: constants.subdomainPriceETH,
        value: Wei(constants.subdomainPriceWei)
      });
      this.props.inputData(encodedInputData);
      this.props.inputGasPrice(constants.gasPriceGwei);
      this.props.inputGasLimit(constants.gasLimit);
    }
  };

  private pollForHash = () => {
    setTimeout(this.getTxStatus, 10000);
  };

  private getTxStatus = () => {
    this.setState({ pollTimeout: false });
    const { broadcast, indexingHash } = this.props;
    if (this.state.purchaseClicked && indexingHash && broadcast[indexingHash]) {
      this.props.fetchTransactionData(broadcast[indexingHash].broadcastedHash);
    }
  };
}

function mapStateToProps(state: AppState): StateProps {
  return {
    broadcast: state.transaction.broadcast,
    indexingHash: state.transaction.sign.indexingHash,
    domainRequests: state.ens.domainRequests,
    tx: state.transactions.txData,
    wallet: walletSelectors.getWalletInst(state),
    isOffline: configMetaSelectors.getOffline(state),
    networkConfig: configSelectors.getNetworkConfig(state),
    transactionBroadcasted: transactionSelectors.currentTransactionBroadcasted(state)
  };
}

const mapDispatchToProps: DispatchProps = {
  resolveDomainRequested: ensActions.resolveDomainRequested,
  clearDomain: ensActions.resolveDomainFailed,
  showNotification: notificationsActions.showNotification,
  closeNotification: notificationsActions.closeNotification,
  setToField: transactionFieldsActions.setToField,
  setValueField: transactionFieldsActions.setValueField,
  inputData: transactionFieldsActions.inputData,
  inputGasPrice: transactionFieldsActions.inputGasPrice,
  inputGasLimit: transactionFieldsActions.inputGasLimit,
  getFromRequested: transactionNetworkActions.getFromRequested,
  getNonceRequested: transactionNetworkActions.getNonceRequested,
  resetTransactionRequested: transactionFieldsActions.resetTransactionRequested,
  fetchTransactionData: transactionsActions.fetchTransactionData
};

export default connect(mapStateToProps, mapDispatchToProps)(ETHSimpleClass);
