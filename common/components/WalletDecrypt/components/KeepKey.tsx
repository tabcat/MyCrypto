import { KeepKeyWallet } from 'libs/wallet';
import React, { PureComponent } from 'react';
import translate, { translateRaw } from 'translations';
import UnsupportedNetwork from './UnsupportedNetwork';
import { Spinner, NewTabLink } from 'components/ui';
import { AppState } from 'reducers';
import { connect } from 'react-redux';
import { SecureWalletName, keepkeyReferralURL } from 'config';
import { getSingleDPath, getPaths } from 'selectors/config/wallet';

//todo: conflicts with comment in walletDecrypt -> onUnlock method
interface OwnProps {
  onUnlock(param: any): void;
}

interface StateProps {
  dPath: DPath | undefined;
  dPaths: DPath[];
}

// todo: nearly duplicates ledger component props
interface State {
  dPath: DPath;
  index: string;
  error: string | null;
  isLoading: boolean;
}

type Props = OwnProps & StateProps;

class KeepKeyDecryptClass extends PureComponent<Props, State> {
  public state: State = {
    dPath: this.props.dPath || this.props.dPaths[0],
    index: '0',
    error: null,
    isLoading: false
  };

  public UNSAFE_componentWillReceiveProps(nextProps: Props) {
    if (this.props.dPath !== nextProps.dPath && nextProps.dPath) {
      this.setState({ dPath: nextProps.dPath });
    }
  }

  public render() {
    const { dPath, error, isLoading } = this.state;
    const showErr = error ? 'is-showing' : '';

    if (!dPath) {
      return <UnsupportedNetwork walletType={translateRaw('X_KEEPKEY')} />;
    }

    return (
      <div className="KeepKeyDecrypt">
        <button
          className="KeepKeyDecrypt-decrypt btn btn-primary btn-lg btn-block"
          onClick={this.handleConnect}
          disabled={isLoading}
        >
          {isLoading ? (
            <div className="KeepKeyDecrypt-message">
              <Spinner light={true} />
              Unlocking...
            </div>
          ) : (
            translate('ADD_TREZOR_SCAN')
          )}
        </button>

        <NewTabLink className="KeepKeyDecrypt-buy btn btn-sm btn-default" href={keepkeyReferralURL}>
          {translate('Don’t have a KeepKey? Order one now!')}
        </NewTabLink>

        <div className={`KeepKeyDecrypt-error alert alert-danger ${showErr}`}>{error || '-'}</div>

        <div className="KeepKeyDecrypt-help">
          <NewTabLink href="https://google.com/">How to use KeepKey with MyCrypto</NewTabLink>
        </div>
      </div>
    );
  }

  private handleConnect = (): void => {
    const { dPath, index } = this.state;
    const indexInt = parseInt(index, 10);

    this.setState({
      isLoading: true,
      error: null
    });

    KeepKeyWallet.getBip44Address(dPath.value, indexInt)
      .then(address => {
        this.reset();
        this.props.onUnlock(new KeepKeyWallet(address, dPath.value, indexInt));
      })
      .catch(err => {
        this.setState({
          error: err.message,
          isLoading: false
        });
      });
  };

  private reset() {
    this.setState({
      index: '0',
      dPath: this.props.dPath || this.props.dPaths[0],
      isLoading: false
    });
  }
}

function mapStateToProps(state: AppState): StateProps {
  return {
    dPath: getSingleDPath(state, SecureWalletName.KEEPKEY),
    dPaths: getPaths(state, SecureWalletName.KEEPKEY)
  };
}

export const KeepKeyDecrypt = connect(mapStateToProps)(KeepKeyDecryptClass);
