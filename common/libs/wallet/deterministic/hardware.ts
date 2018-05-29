import { DeterministicWallet } from './deterministic';

export interface ChainCodeResponse {
  chainCode: string;
  publicKey: string;
}

export class HardwareWallet extends DeterministicWallet {
  // @ts-ignore
  public static getChainCode(dpath: string): Promise<ChainCodeResponse> {
    throw new Error(`getChainCode is not implemented in ${this.constructor.name}`);
  }

  // @ts-ignore
  public static getBip44Address(dpath: string, index: number): Promise<string> {
    throw new Error(`getBip44Address is not implemented in ${this.constructor.name}`);
  }

  public displayAddress(): Promise<boolean> {
    throw new Error(`displayAddress is not implemented in ${this.constructor.name}`);
  }
}
