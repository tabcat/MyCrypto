import React from 'react';
import { connect } from 'react-redux';

import { AppState } from '../../features/reducers';
import { isValidENSName } from '../../libs/validators';
import { ensActions } from 'features/ens';
import { Input } from 'components/ui';
import './ETHSimple.scss';
import translate from '../../translations';

interface State {
  domainToCheck: string;
  isValidDomain: boolean;
  isFocused: boolean;
}

interface Props {
  domainRequests: AppState['ens']['domainRequests'];
  resolveDomainRequested: ensActions.TResolveDomainRequested;
}

class ETHSimpleClass extends React.PureComponent<Props, State> {
  public state = {
    isFocused: false,
    isValidDomain: false,
    domainToCheck: ''
  };

  public render() {
    const { domainRequests } = this.props;

    // const { activePromo } = this.state;

    return (
      <div className="ENSPortfolio">
        {/*<h5 className="ENSPortfolio-title">My Domains</h5>*/}
        <h5 className="ENSPortfolio-title">{translate('ETHSIMPLE_TITLE')}</h5>

        <div className="ENSPortfolio-description">{translate('ETHSIMPLE_DESCRIPTION')}</div>

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

        <form className="ENSInput" onSubmit={this.onSubmit}>
          <div className="input-group-wrapper">
            <label className="input-group input-group-inline ENSInput-name">
              <Input
                // value={domainToCheck}
                // isValid={!!domainToCheck && isValidDomain}
                className="border-rad-right-0"
                type="text"
                placeholder="mydomain"
                onChange={this.onChange}
                onFocus={this.onFocus}
                onBlur={this.onBlur}
                // disabled={isLoading}
              />
              <span className="input-group-addon">.ethsimple.eth</span>
            </label>
            {/*{domainToCheck &&*/}
            {/*!isValidDomain && (*/}
            {/*<p className="help-block is-invalid">{translate('ENS_INVALID_INPUT')}</p>*/}
            {/*)}*/}
          </div>
          <button
            className="ENSInput-button btn btn-primary btn-block"
            // disabled={!isValidDomain || isLoading}
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
              className="ENSPortfolio-logo"
            />
          </div>
        </div>
      </div>
    );
  }

  // add delay to namehash computation / getting the availability
  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const domainToCheck = event.currentTarget.value.toLowerCase().trim();
    const isValidDomain = isValidENSName(domainToCheck);
    this.setState({
      domainToCheck,
      isValidDomain
    });
  };

  private onSubmit = (ev: React.FormEvent<HTMLElement>) => {
    ev.preventDefault();
    const { isValidDomain, domainToCheck } = this.state;
    return isValidDomain && this.props.resolveDomainRequested(domainToCheck);
  };

  private onFocus = () => this.setState({ isFocused: true });
  private onBlur = () => this.setState({ isFocused: false });
}

function mapStateToProps(state: AppState) {
  return {
    wallet: state.wallet.inst
  };
}

// export default connect(mapStateToProps, {})(ETHSimpleClass);

export default connect(mapStateToProps, {
  resolveDomainRequested: ensActions.resolveDomainRequested
})(ETHSimpleClass);
