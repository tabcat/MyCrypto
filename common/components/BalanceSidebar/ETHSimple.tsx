import React from 'react';
import { connect } from 'react-redux';
import { AppState } from '../../features/reducers';
import { isValidENSAddress } from '../../libs/validators';
import { ensActions } from 'features/ens';
import { Input } from 'components/ui';
import './ETHSimple.scss';
import { translate, translateRaw } from '../../translations';
import { walletSelectors } from 'features/wallet';
import Markdown from 'react-markdown';
import NewTabLink from 'components/ui/NewTabLink';

interface State {
  domainToCheck: string;
  isValidDomain: boolean;
  isFocused: boolean;
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
    isLoading: false,
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
    const { isValidDomain, domainToCheck, description } = this.state;
    const req = domainRequests[domainToCheck];
    const isLoading = req && !req.data && !req.error;

    return (
      <div className="ETHSimple">
        {/*<h5 className="ENSPortfolio-title">My Domains</h5>*/}
        <h5 className="ETHSimple-title">{translate('ETHSIMPLE_TITLE')}</h5>

        <div className="ETHSimple-description">{description}</div>

        {/*<div className="row form-group">*/}
        {/*<div className="col-xs-12 col-md-6">*/}
        {/*<hr className="hidden-md hidden-lg" />*/}
        {/*</div>*/}
        {/*<div className="col-xs-12 col-md-6">*/}
        {/*</div>*/}
        {/*</div>*/}

        {/*<div className="row form-group">*/}
        {/*<div className="col-xs-6">*/}
        {/*</div>*/}
        {/*<div className="col-xs-6">*/}
        {/*</div>*/}
        {/*</div>*/}

        {/*<div className="row form-group">*/}
        {/*<div className="col-xs-12 AdvancedGas-data">*/}
        {/*</div>*/}
        {/*</div>*/}

        <form className="ETHSimpleInput" onSubmit={this.onSubmit}>
          <div className="input-group-wrapper">
            <label className="input-group input-group-inline ETHSimpleInput-name">
              <Input
                value={domainToCheck}
                isValid={!!domainToCheck && isValidDomain}
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
            {domainToCheck &&
              !isValidDomain && (
                <p className="help-block is-invalid">{translate('ENS_SUBDOMAIN_INVALID_INPUT')}</p>
              )}
          </div>
          <button
            className="ETHSimple-button btn btn-primary btn-block"
            disabled={!isValidDomain || isLoading}
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

  // add delay to namehash computation / getting the availability
  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const domainToCheck = event.currentTarget.value.toLowerCase().trim();
    const isValidDomain = isValidENSAddress(domainToCheck + '.ethsimple.eth');
    const description = this.makeDescription(domainToCheck);
    this.setState({
      domainToCheck,
      isValidDomain,
      description
    });
  };

  private onSubmit = (ev: React.FormEvent<HTMLElement>) => {
    ev.preventDefault();
    const { isValidDomain, domainToCheck } = this.state;
    return isValidDomain && this.props.resolveDomainRequested(domainToCheck + '.ethsimple.eth');
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

// export default connect(mapStateToProps, {})(ETHSimpleClass);

export default connect(mapStateToProps, {
  resolveDomainRequested: ensActions.resolveDomainRequested
})(ETHSimpleClass);
