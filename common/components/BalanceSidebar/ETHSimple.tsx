import React from 'react';
import { connect } from 'react-redux';

import { AppState } from '../../features/reducers';
import { isValidENSAddress } from '../../libs/validators';
import { ensActions } from 'features/ens';
import { NameState } from 'libs/ens';
import { Input } from 'components/ui';
import { translate, translateRaw } from '../../translations';
import { walletSelectors } from 'features/wallet';
import Markdown from 'react-markdown';
import NewTabLink from 'components/ui/NewTabLink';
// import { makeTransaction, getTransactionFields, IHexStrTransaction } from 'libs/transaction';
// import {
//   transactionFieldsActions,
//   transactionFieldsSelectors,
//   transactionNetworkActions
// } from 'features/transaction';
import './ETHSimple.scss';

interface State {
  subdomain: string;
  domainToCheck: string;
  isValidDomain: boolean;
  isAvailableDomain: boolean;
  isFocused: boolean;
  isResolving: boolean;
  isLoading: boolean;
  description: React.ReactElement<any>;
}

interface Props {
  domainRequests: AppState['ens']['domainRequests'];
  resolveDomainRequested: ensActions.TResolveDomainRequested;
  wallet: AppState['wallet']['inst'];
}

class ETHSimpleClass extends React.Component<Props, State> {
  public state = {
    isFocused: false,
    isValidDomain: false,
    isAvailableDomain: false,
    isResolving: false,
    isLoading: false,
    subdomain: '',
    domainToCheck: '',
    description: this.buildDesc()
  };

  private buildDesc() {
    let desc: string;
    let addr: string;

    if (this.props.wallet) addr = this.props.wallet.getAddressString();
    else addr = translateRaw('ETHSIMPLE_DESC_DEFAULT_NO_ADDR');

    desc =
      translateRaw('ETHSIMPLE_DESC_0') +
      translateRaw('ETHSIMPLE_DESC_DEFAULT_SUBDOMAIN') +
      translateRaw('ETHSIMPLE_DESC_1') +
      '`' +
      addr.substring(0, 25) +
      '...`';

    return (
      <Markdown
        escapeHtml={true}
        unwrapDisallowed={true}
        allowedTypes={['link', 'emphasis', 'strong', 'code', 'root', 'inlineCode']}
        renderers={{
          root: React.Fragment,
          link: NewTabLink
        }}
        source={desc}
      />
    );
  }

  public render() {
    const { domainRequests } = this.props;
    const {
      isLoading,
      isValidDomain,
      isAvailableDomain,
      subdomain,
      domainToCheck,
      description
    } = this.state;
    const req = domainRequests[domainToCheck];
    const isResolving = req && !req.data && !req.error;

    return (
      <div className="ETHSimple">
        <h5 className="ETHSimple-title">{translate('ETHSIMPLE_TITLE')}</h5>
        <div className="ETHSimple-description">{description}</div>
        <form className="ETHSimpleInput" onSubmit={this.onSubmit}>
          <div className="input-group-wrapper">
            <label className="input-group input-group-inline ETHSimpleInput-name">
              <Input
                value={subdomain}
                isValid={!!subdomain && isValidDomain && isAvailableDomain}
                className="border-rad-right-0"
                type="text"
                placeholder="mydomain"
                onChange={this.onChange}
                onFocus={this.onFocus}
                onBlur={this.onBlur}
                disabled={isLoading}
              />
              <span className="input-group-addon">.ethsimple.eth</span>
            </label>
            {subdomain &&
              !isValidDomain && (
                <p className="help-block is-invalid">{translate('ENS_SUBDOMAIN_INVALID_INPUT')}</p>
              )}
            {subdomain &&
              !isAvailableDomain &&
              isValidDomain && <p className="help-block is-invalid">Domain unavailable</p>}
          </div>
          <button
            className="ETHSimple-button btn btn-primary btn-block"
            disabled={!isValidDomain || isResolving || isLoading || !isAvailableDomain}
          >
            {translate('ETHSIMPLE_ACTION')}
          </button>
        </form>
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

  // IHexStrWeb3Transaction => makeTransaction => signTx

  // getTransaction

  // const transactionOptions = {
  //   to: getSchedulerAddress(scheduleType.value, configSelectors.getNetworkConfig(state)),
  //   data: transactionData,
  //   gasLimit: EAC_SCHEDULING_CONFIG.SCHEDULING_GAS_LIMIT,
  //   gasPrice: gasPrice.value,
  //   nonce: Nonce('0'),
  //   value: endowment
  // };

  // const schedulingTransaction: EthTx = makeTransaction(transactionOptions);

  //   export const getSchedulingTransaction = (state: AppState): IGetTransaction => {
  //   const { isFullTransaction } = getTransaction(state);

  //   const currentTo = getCurrentTo(state);
  //   const currentValue = getCurrentValue(state);
  //   const nonce = transactionFieldsSelectors.getNonce(state);
  //   const gasPrice = transactionFieldsSelectors.getGasPrice(state);
  //   const timeBounty = scheduleSelectors.getTimeBounty(state);
  //   const scheduleGasPrice = scheduleSelectors.getScheduleGasPrice(state);
  //   const scheduleGasLimit = scheduleSelectors.getScheduleGasLimit(state);
  //   const scheduleType = scheduleSelectors.getScheduleType(state);

  //   const endowment = calcEACEndowment(
  //     scheduleGasLimit.value,
  //     currentValue.value,
  //     scheduleGasPrice.value,
  //     timeBounty.value
  //   );

  //   let transactionData = null;

  //   const transactionFullAndValid = isFullTransaction && isSchedulingTransactionValid(state);

  //   if (transactionFullAndValid) {
  //     const deposit = scheduleSelectors.getScheduleDeposit(state);
  //     const scheduleTimestamp = scheduleSelectors.getScheduleTimestamp(state);
  //     const windowSize = scheduleSelectors.getWindowSize(state);
  //     const callData = transactionFieldsSelectors.getData(state);
  //     const scheduleTimezone = scheduleSelectors.getScheduleTimezone(state);
  //     const windowStart = scheduleSelectors.getWindowStart(state);

  //     transactionData = getScheduleData(
  //       currentTo.raw,
  //       callData.raw,
  //       scheduleGasLimit.value,
  //       currentValue.value,
  //       scheduleHelpers.windowSizeBlockToMin(windowSize.value, scheduleType.value),
  //       scheduleHelpers.calculateWindowStart(
  //         scheduleType.value,
  //         scheduleTimestamp,
  //         scheduleTimezone.value,
  //         windowStart.value
  //       ),
  //       scheduleGasPrice.value,
  //       timeBounty.value,
  //       deposit.value
  //     );
  //   }

  //   const transactionOptions = {
  //     to: getSchedulerAddress(scheduleType.value, configSelectors.getNetworkConfig(state)),
  //     data: transactionData,
  //     gasLimit: EAC_SCHEDULING_CONFIG.SCHEDULING_GAS_LIMIT,
  //     gasPrice: gasPrice.value,
  //     nonce: Nonce('0'),
  //     value: endowment
  //   };

  //   if (nonce) {
  //     transactionOptions.nonce = Nonce(nonce.raw);
  //   }

  //   const schedulingTransaction: EthTx = makeTransaction(transactionOptions);

  //   return {
  //     transaction: schedulingTransaction,
  //     isFullTransaction: transactionFullAndValid
  //   };
  // };

  // signTransaction /libs/utils/transactions/index

  componentDidUpdate(prevProps: Props) {
    const { domainRequests } = this.props;
    if (domainRequests !== prevProps.domainRequests) {
      const { domainToCheck } = this.state;
      const req = domainRequests[domainToCheck];
      const isResolving = req && !req.data && !req.error;
      const isAvailableDomain =
        !isResolving && req && req.data && !req.error && req.data.mode !== NameState.Open
          ? false
          : true;
      this.setState({
        isResolving,
        isAvailableDomain
      });
    }
  }

  // add delay to namehash computation / getting the availability
  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const subdomain = event.currentTarget.value.toLowerCase().trim();
    const domainToCheck = subdomain + (subdomain.length > 0 ? '.ethsimple' : '');
    const isValidDomain = isValidENSAddress(domainToCheck + '.eth');
    let isAvailableDomain = this.state.isAvailableDomain;
    let description = this.state.description;
    if (isValidDomain) {
      this.props.resolveDomainRequested(domainToCheck);
      isAvailableDomain = true;
      description = this.makeDescription(subdomain);
    }
    this.setState({
      subdomain,
      domainToCheck,
      isValidDomain,
      isAvailableDomain,
      description
    });
  };

  private onSubmit = (ev: React.FormEvent<HTMLElement>) => {
    ev.preventDefault();
    const { isValidDomain } = this.state;
    if (isValidDomain) {
      // tx
    }
  };

  private onFocus = () => this.setState({ isFocused: true });
  private onBlur = () => this.setState({ isFocused: false });

  private makeDescription = (domain: string) => {
    let desc: string;
    let addr: string;

    if (this.props.wallet) addr = this.props.wallet.getAddressString();
    else addr = translateRaw('ETHSIMPLE_DESC_DEFAULT_NO_ADDR');

    desc =
      translateRaw('ETHSIMPLE_DESC_0') +
      (domain.length > 0 ? domain : translateRaw('ETHSIMPLE_DESC_DEFAULT_SUBDOMAIN')) +
      translateRaw('ETHSIMPLE_DESC_1') +
      '`' +
      addr.substring(0, 25) +
      '...`';

    return (
      <Markdown
        escapeHtml={true}
        unwrapDisallowed={true}
        allowedTypes={['link', 'emphasis', 'strong', 'code', 'root', 'inlineCode']}
        renderers={{
          root: React.Fragment,
          link: NewTabLink
        }}
        source={desc}
      />
    );
  };
}

function mapStateToProps(state: AppState) {
  return {
    domainRequests: state.ens.domainRequests,
    wallet: walletSelectors.getWalletInst(state)
  };
}

export default connect(mapStateToProps, {
  resolveDomainRequested: ensActions.resolveDomainRequested
})(ETHSimpleClass);
