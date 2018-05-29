import { DeviceClientManager } from '@keepkey/device-client/dist/device-client-manager';
import { HidHelper } from '@keepkey/device-client/dist/hid-helper';
import HID from 'node-hid';
import NodeHidTransport from './NodeHidTransport';

const dcm = new DeviceClientManager();

export default class NodeHidHelper implements HidHelper {
  public async getActiveClient() {
    const devices = HID.devices();
    const device = devices.find(d => d.vendorId === 11044 && d.product === 'KeepKey');

    if (!device) {
      throw new Error('No KeepKey device found');
    }

    return dcm.factory(new NodeHidTransport(device));
  }
}
