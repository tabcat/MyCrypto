/* tslint:disable max-classes-per-file */
import { DeviceClientManager } from '@keepkey/device-client/dist/device-client-manager';
import { NodeVector } from '@keepkey/device-client/dist/node-vector';
import { WalletLib } from 'shared/enclave/types';
import NodeHidHelper from './NodeHidHelper';

const dcm = new DeviceClientManager();
dcm.hidHelper = new NodeHidHelper();

const KeepKey: WalletLib = {
  async getChainCode() {
    throw new Error('KeepKey doesn’t getChainCode');
  },

  async getAddress(index?: number, dpath?: string) {
    if (index === null || index === undefined || !dpath) {
      throw new Error('KeepKey requires index and dpath parameters');
    }

    const client = await dcm.getActiveClient();
    const nv = NodeVector.fromString(`${dpath}/${index}`);
    const res = await client.getEthereumAddress(nv, false);
    return { address: res.toString() as string };
  },

  async signTransaction() {
    throw new Error('Not yet implemented');
  },

  async signMessage() {
    throw new Error('Not yet implemented');
  },

  async displayAddress() {
    throw new Error('Not yet implemented');
  }
};

export default KeepKey;
