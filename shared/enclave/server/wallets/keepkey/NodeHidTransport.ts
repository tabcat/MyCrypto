import { Transport } from '@keepkey/device-client/dist/transport';
import HID from 'node-hid';
import ByteBuffer from 'bytebuffer';

export default class NodeHidTransport extends Transport {
  private device: HID.HID | null;

  constructor(deviceData: HID.Device) {
    super(deviceData);

    this.device = new HID.HID(deviceData.vendorId, deviceData.productId);
  }

  protected async _write(msg: ByteBuffer) {
    const device = this.getDevice();
    console.log('Writing', [...msg.buffer]);
    device.write([...msg.buffer]);
    // this.closeDevice();
  }

  protected async _read() {
    return new Promise((resolve, reject) => {
      const device = this.getDevice();
      device.read((err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
        // this.closeDevice();
      });
    });
  }

  private getDevice() {
    if (this.device) {
      return this.device;
    }

    try {
      this.device = new HID.HID(this.vendorId, this.productId);
      return this.device;
    } catch (err) {
      console.error('Could not open KeepKey HID:', err);
      throw new Error('Could not open KeepKey wallet, it may be in use by another app');
    }
  }

  private closeDevice() {
    if (this.device) {
      this.device.close();
      this.device = null;
    }
  }
}
