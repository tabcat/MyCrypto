import React from 'react';
import { connect } from 'react-redux';
import { sha3, bufferToHex } from 'ethereumjs-util';
import { translate, translateRaw } from 'translations';
import { TransactionState } from 'types/transactions';
import { AppState } from 'features/reducers';
import { ensActions, ensSelectors } from 'features/ens';
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
import { NameState, getNameHash, IBaseSubdomainRequest, IBaseAddressRequest } from 'libs/ens';
import Contract from 'libs/contracts';
import { Address, Wei } from 'libs/units';
import { Input, Spinner } from 'components/ui';
import { ConfirmationModal } from 'components/ConfirmationModal';
import { SendButtonFactory } from 'components/SendButtonFactory';
import './ETHSimple.scss';
const constants = require('./ETHSimpleConstants.json');

interface State {
  isValidDomain: boolean;
  isAvailableDomain: boolean;
  isFocused: boolean;
  isLoading: boolean;
  purchaseClicked: boolean;
  initialPollRequested: boolean;
  pollTimeout: boolean;
  ownedByAddress: boolean;
  subdomain: string;
  subdomainToDisplay: string;
  domainToCheck: string;
  address: string;
  reverseResolvedName: string;
}

interface OwnProps {
  subdomainPurchased(label: string): void;
}

interface StateProps {
  domainRequests: AppState['ens']['domainRequests'];
  addressRequests: AppState['ens']['addressRequests'];
  broadcast: AppState['transaction']['broadcast'];
  indexingHash: AppState['transaction']['sign']['indexingHash'];
  wallet: AppState['wallet']['inst'];
  isResolving: boolean | null;
  isOffline: ReturnType<typeof configMetaSelectors.getOffline>;
  networkConfig: ReturnType<typeof configSelectors.getNetworkConfig>;
  toChecksumAddress: ReturnType<typeof configSelectors.getChecksumAddressFn>;
  txState: { [txHash: string]: TransactionState };
  transactionBroadcasted: boolean | null;
}

interface DispatchProps {
  resolveDomainRequested: ensActions.TResolveDomainRequested;
  resolveAddressRequested: ensActions.TReverseResolveAddressRequested;
  showNotification: notificationsActions.TShowNotification;
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

type Props = OwnProps & StateProps & DispatchProps;

class ETHSimpleClass extends React.Component<Props, State> {
  public state = {
    isFocused: false,
    isValidDomain: false,
    isAvailableDomain: false,
    isLoading: false,
    purchaseClicked: false,
    initialPollRequested: false,
    pollTimeout: false,
    ownedByAddress: false,
    subdomain: '',
    subdomainToDisplay: '',
    domainToCheck: '',
    address: '',
    reverseResolvedName: ''
  };

  public render() {
    const {
      isLoading,
      isValidDomain,
      isAvailableDomain,
      purchaseClicked,
      subdomain,
      ownedByAddress
    } = this.state;
    const { isResolving } = this.props;
    const validSubdomain = ownedByAddress
      ? ownedByAddress
      : !!subdomain && isValidDomain && isAvailableDomain;
    const purchaseDisabled =
      isResolving || !isAvailableDomain || purchaseClicked || subdomain.length === 0; // || this.props.isOffline
    const description = this.makeDescription(subdomain);
    const statusLabel = this.makeStatusLabel();
    const esDomain = '.' + constants.domain + '.' + constants.tld;

    return (
      <div className="ETHSimple">
        <h5 className="ETHSimple-title">{translate('ETHSIMPLE_TITLE')}</h5>
        <div className="ETHSimple-description">{description}</div>
        <form className="ETHSimpleInput" onSubmit={this.onSubmit}>
          <div className="input-group-wrapper">
            <label className="input-group input-group-inline ETHSimpleInput-name">
              <Input
                value={subdomain}
                isValid={validSubdomain}
                className="border-rad-right-0"
                type="text"
                placeholder="mydomain"
                spellCheck={false}
                onChange={this.onChange}
                onFocus={this.onFocus}
                onBlur={this.onBlur}
                disabled={isLoading}
              />
              <span className="input-group-addon">{esDomain}</span>
            </label>
          </div>
          <SendButtonFactory
            signing={true}
            Modal={ConfirmationModal}
            withProps={({ disabled, signTx, openModal }) => (
              <button
                disabled={disabled || purchaseDisabled}
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
        {statusLabel}
        <div className="row">
          <div className="col-xs-12">
            <a
              href={constants.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ETHSimple-logo"
            />
          </div>
        </div>
      </div>
    );
  }

  // public componentWillMount() {
  //   if (!this.props.isOffline) {

  //   }
  // }

  public componentDidMount() {
    if (!this.props.isOffline) {
      this.props.resetTransactionRequested();
      this.props.getNonceRequested();
      this.props.getFromRequested();
      this.setAddressFromWallet();
    }
  }

  componentDidUpdate(prevProps: Props) {
    const {
      domainRequests,
      addressRequests,
      broadcast,
      indexingHash,
      txState,
      isResolving
    } = this.props;
    const {
      purchaseClicked,
      initialPollRequested,
      subdomain,
      domainToCheck,
      pollTimeout,
      address,
      isValidDomain
    } = this.state;
    if (domainRequests !== prevProps.domainRequests) {
      const req = domainRequests[domainToCheck];
      const resolveCompleteAndValid =
        !isResolving &&
        !!req &&
        !!(req.data as IBaseSubdomainRequest) &&
        !req.error &&
        isValidDomain &&
        (req.data as IBaseSubdomainRequest).name === domainToCheck;
      const isAvailableDomain =
        resolveCompleteAndValid && (req.data as IBaseSubdomainRequest).mode !== NameState.Open
          ? false
          : true;
      const ownedByAddress =
        resolveCompleteAndValid &&
        (req.data as IBaseSubdomainRequest).ownerAddress === this.state.address;
      const subdomainToDisplay = resolveCompleteAndValid
        ? subdomain.length > 0 ? domainToCheck + '.' + constants.tld : ''
        : this.state.subdomainToDisplay;
      this.setState({
        isAvailableDomain,
        ownedByAddress,
        subdomainToDisplay
      });
      if (resolveCompleteAndValid && isAvailableDomain) this.buildTX(subdomain); //  && !this.props.isOffline
    }
    if (addressRequests !== prevProps.addressRequests) {
      const req = addressRequests[address];
      if (!!req && !req.error && req.data && (req.data as IBaseAddressRequest).name) {
        const reverseResolvedName = (req.data as IBaseAddressRequest).name;
        if (reverseResolvedName.length > 0) {
          this.props.subdomainPurchased(reverseResolvedName);
          this.setState({ reverseResolvedName });
        }
      }
    }
    if (
      broadcast !== prevProps.broadcast &&
      purchaseClicked &&
      !initialPollRequested &&
      !!indexingHash &&
      indexingHash.length > 0 &&
      !!broadcast[indexingHash]
    ) {
      if ((broadcast as any)[indexingHash as string].broadcastSuccessful) {
        this.setState({ initialPollRequested: true });
        this.pollForHash();
      }
    }
    if (purchaseClicked && initialPollRequested) {
      if (
        txState !== prevProps.txState &&
        !!txState &&
        txState[(broadcast as any)[indexingHash as string].broadcastedHash as string].data
      ) {
        this.props.resetTransactionRequested();
        this.props.getNonceRequested();
        this.props.getFromRequested();
        this.props.resolveDomainRequested(domainToCheck, this.props.networkConfig.isTestnet, true);
        this.props.subdomainPurchased(domainToCheck + '.' + constants.tld);
        this.props.showNotification(
          'success',
          translateRaw('ETHSIMPLE_TX_CONFIRMED_MODAL_DESC', {
            $domain: subdomain + '.' + constants.domain + '.' + constants.tld
          }),
          5000
        );
        this.setState({
          isAvailableDomain: false,
          purchaseClicked: false,
          ownedByAddress: true,
          initialPollRequested: false
        });
      } else if (!pollTimeout) {
        this.setState({ pollTimeout: true });
        this.pollForHash();
      }
    }
  }

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const subdomain = event.currentTarget.value.toLowerCase().trim();
    const domainToCheck = subdomain + (subdomain.length > 0 ? '.' + constants.domain : '');
    const isValidDomain = isValidENSAddress(domainToCheck + '.' + constants.tld);
    let purchaseClicked = false;
    let ownedByAddress = false;
    if (isValidDomain) {
      this.props.resolveDomainRequested(domainToCheck, this.props.networkConfig.isTestnet); // if (!this.props.isOffline)
    }
    console.log(domainToCheck, this.props.networkConfig.isTestnet);
    this.setState({
      subdomain,
      domainToCheck,
      isValidDomain,
      purchaseClicked,
      ownedByAddress
    });
  };

  private onSubmit = (ev: React.FormEvent<HTMLElement>) => {
    ev.preventDefault();
    this.setState({ purchaseClicked: true });
  };

  private onFocus = () => this.setState({ isFocused: true });
  private onBlur = () => this.setState({ isFocused: false });

  private makeDescription = (subdomain: string) => {
    let addr: string;
    if (this.state.address.length > 0) addr = this.state.address;
    else addr = translateRaw('ETHSIMPLE_DESC_DEFAULT_NO_ADDR');
    const esDomain = '.' + constants.domain + '.' + constants.tld;
    const cutoff = subdomain.length > 10 ? 0 : 15;
    return translate('ETHSIMPLE_DESC', {
      $subdomain:
        (subdomain.length > 0 ? subdomain : translateRaw('ETHSIMPLE_DESC_DEFAULT_SUBDOMAIN')) +
        esDomain, // '<pre><code<b>' + (domain.length > 0 ? domain : translateRaw('ETHSIMPLE_DESC_DEFAULT_SUBDOMAIN')) + '.ethsimple.eth</b></code</pre>',
      $addr: addr.substring(0, addr.length - cutoff) + (cutoff > 0 ? '...' : '')
    });
  };

  private makeStatusLabel = () => {
    const {
      subdomain,
      isValidDomain,
      isAvailableDomain,
      purchaseClicked,
      ownedByAddress,
      subdomainToDisplay
    } = this.state;
    let markup = null;
    let icon = null;
    let className;

    if (!!subdomain && !isValidDomain) {
      className = 'help-block is-invalid';
      markup = translate('ENS_SUBDOMAIN_INVALID_INPUT');
    } else if (
      !!subdomainToDisplay &&
      !purchaseClicked &&
      !isAvailableDomain &&
      isValidDomain &&
      !ownedByAddress
    ) {
      className = 'help-block is-invalid';
      icon = <i className="fa fa-remove" />;
      markup = translate('ETHSIMPLE_SUBDOMAIN_UNAVAILABLE', {
        $domain: subdomainToDisplay
      });
    } else if (!!subdomainToDisplay && !purchaseClicked && isAvailableDomain && isValidDomain) {
      className = 'help-block is-valid';
      icon = <i className="fa fa-check" />;
      markup = translate('ETHSIMPLE_SUBDOMAIN_AVAILABLE', {
        $domain: subdomainToDisplay
      });
    } else if (!!subdomain && purchaseClicked && !this.props.transactionBroadcasted) {
      className = 'help-block is-semivalid';
      icon = <Spinner />;
      markup = translate('ETHSIMPLE_WAIT_FOR_USER_SIGN');
    } else if (!!subdomain && purchaseClicked && this.props.transactionBroadcasted) {
      className = 'help-block is-semivalid';
      icon = <Spinner />;
      markup = translate('ETHSIMPLE_WAIT_FOR_CONFIRMATION');
    } else if (!!subdomainToDisplay && !purchaseClicked && !isAvailableDomain && ownedByAddress) {
      className = 'help-block is-valid';
      icon = <i className="fa fa-check" />;
      markup = translate('ETHSIMPLE_SUBDOMAIN_OWNED_BY_USER', {
        $domain: subdomainToDisplay
      });
    }

    return (
      <React.Fragment>
        <span className={className}>
          {icon}
          {markup}
        </span>
      </React.Fragment>
    );
  };

  public setAddressFromWallet() {
    if (this.props.wallet != null) {
      const address = this.props.toChecksumAddress(this.props.wallet.getAddressString());
      if (address !== this.state.address) {
        this.setState({ address });
        this.props.resolveAddressRequested(address, this.props.networkConfig.isTestnet);
      }
    }
  }

  private buildTX = (subdomain: string) => {
    const { networkConfig } = this.props;
    const { address } = this.state;
    let ethSimpleSubdomainRegistrarAddr;
    if (networkConfig.isTestnet)
      ethSimpleSubdomainRegistrarAddr = constants.subdomainRegistrarAddr.testnet;
    else ethSimpleSubdomainRegistrarAddr = constants.subdomainRegistrarAddr.mainnet;
    let ethSimpleSubdomainRegistrarInstance = new Contract(constants.subdomainRegistrarABI);
    let inputs = {
      _node: getNameHash(constants.domain + '.' + constants.tld),
      _label: bufferToHex(sha3(subdomain)),
      _newNode: getNameHash(subdomain + '.' + constants.domain + '.' + constants.tld),
      _resolver: constants.publicResolverAddr,
      _owner: address,
      _resolvedAddress: address,
      _contentHash: constants.emptyContentHash
    } as any;
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
  };

  private pollForHash = () => {
    setTimeout(this.getTxStatus, 10000);
  };

  private getTxStatus = () => {
    this.setState({ pollTimeout: false });
    const { broadcast, indexingHash } = this.props;
    if (
      this.state.purchaseClicked &&
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
    broadcast: state.transaction.broadcast,
    indexingHash: state.transaction.sign.indexingHash,
    domainRequests: state.ens.domainRequests,
    addressRequests: state.ens.addressRequests,
    txState: state.transactions.txData,
    wallet: walletSelectors.getWalletInst(state),
    isResolving: ensSelectors.getResolvingDomain(state),
    isOffline: configMetaSelectors.getOffline(state),
    networkConfig: configSelectors.getNetworkConfig(state),
    toChecksumAddress: configSelectors.getChecksumAddressFn(state),
    transactionBroadcasted: transactionSelectors.currentTransactionBroadcasted(state)
  };
}

const mapDispatchToProps: DispatchProps = {
  resolveDomainRequested: ensActions.resolveDomainRequested,
  resolveAddressRequested: ensActions.reverseResolveAddressRequested,
  showNotification: notificationsActions.showNotification,
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
