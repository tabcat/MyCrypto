import EthTx from 'ethereumjs-tx';
import { HardwareWallet } from './hardware';
import { getTransactionFields } from 'libs/transaction';
import { IFullWallet } from '../IWallet';
import { translateRaw } from 'translations';
import EnclaveAPI, { WalletTypes } from 'shared/enclave/client';

export class KeepKeyWallet extends HardwareWallet implements IFullWallet {
  public static async getBip44Address(dpath: string, index: number) {
    if (process.env.BUILD_ELECTRON) {
      const res = await EnclaveAPI.getAddress({
        walletType: WalletTypes.KEEPKEY,
        dpath,
        index
      });
      return res.address;
    }

    throw new Error('KeepKey is not supported on the web');
  }

  constructor(address: string, dPath: string, index: number) {
    super(address, dPath, index);
  }

  public async signRawTransaction(t: EthTx): Promise<Buffer> {
    const txFields = getTransactionFields(t);

    if (process.env.BUILD_ELECTRON) {
      const res = await EnclaveAPI.signTransaction({
        walletType: WalletTypes.KEEPKEY,
        transaction: txFields,
        path: this.getPath()
      });
      return new EthTx(res.signedTransaction).serialize();
    }

    throw new Error('KeepKey is not supported on the web');
  }

  public async signMessage(msg: string): Promise<string> {
    if (!msg) {
      throw Error('No message to sign');
    }

    if (process.env.BUILD_ELECTRON) {
      const res = await EnclaveAPI.signMessage({
        walletType: WalletTypes.KEEPKEY,
        message: msg,
        path: this.getPath()
      });
      return res.signedMessage;
    }

    throw new Error('KeepKey is not supported on the web');
  }

  public async displayAddress() {
    const path = this.dPath + '/' + this.index;

    if (process.env.BUILD_ELECTRON) {
      return EnclaveAPI.displayAddress({
        walletType: WalletTypes.KEEPKEY,
        path
      })
        .then(res => res.success)
        .catch(() => false);
    }

    throw new Error('KeepKey is not supported on the web');
  }

  public getWalletType(): string {
    return translateRaw('X_KEEPKEY');
  }
}
