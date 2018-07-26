import React, { Component } from 'react';
import { ZeroEx } from '0x.js';
import { BigNumber } from 'bignumber.js';

import { shepherdProvider } from 'libs/nodes';
import TabSection from 'containers/TabSection';

BigNumber.config({
  EXPONENTIAL_AT: 1000
});

class Exchanger {
  provider = window.web3.currentProvider;
  configs = { networkId: 1 };
  decimals = 18;
  instance = new ZeroEx(this.provider, this.configs);
}

export default class Exchange extends Component {
  exchanger = new Exchanger();

  exchange = async () => {
    try {
      const wethAddress = this.exchanger.instance.etherToken.getContractAddressIfExists() as string;
      const zrxAddress = this.exchanger.instance.exchange.getZRXTokenAddress();
      const exchangeAddress = this.exchanger.instance.exchange.getContractAddress();

      const accounts = await this.exchanger.instance.getAvailableAddressesAsync();

      const makerAddress = accounts[0];
      // const takerAddress = "0x65bF70cd1fAd35fCb422Ee4bD4d2d8633D79c43E";

      // const setMakerAllowTxHash = await this.exchanger.instance.token.setUnlimitedProxyAllowanceAsync(
      //   zrxAddress,
      //   makerAddress,
      //   { gasPrice: new BigNumber('12000000000') }
      // );
      // await this.exchanger.instance.awaitTransactionMinedAsync(setMakerAllowTxHash);

      // Deposit WETH
      // const ethAmount = new BigNumber(0.001);
      // const ethToConvert = ZeroEx.toBaseUnitAmount(ethAmount, 18);
      // const convertEthTxHash = await this.exchanger.instance.etherToken.depositAsync(
      //   wethAddress,
      //   ethToConvert,
      //   makerAddress,
      //   { gasPrice: new BigNumber('12000000000') }
      // );
      // await this.exchanger.instance.awaitTransactionMinedAsync(convertEthTxHash);

      console.log('c');

      // Make order
      const order = {
        maker: '0xc9af17853600357bc89005291b85fab4ccd2f198',
        taker: ZeroEx.NULL_ADDRESS,
        feeRecipient: ZeroEx.NULL_ADDRESS,
        makerTokenAddress: wethAddress,
        takerTokenAddress: zrxAddress,
        exchangeContractAddress: exchangeAddress,
        salt: ZeroEx.generatePseudoRandomSalt(),
        makerFee: new BigNumber(0),
        takerFee: new BigNumber(0),
        makerTokenAmount: ZeroEx.toBaseUnitAmount(new BigNumber(0.000001), 18),
        takerTokenAmount: ZeroEx.toBaseUnitAmount(new BigNumber(0.000001), 18),
        expirationUnixTimestampSec: new BigNumber(Date.now() + 3600000)
      };

      const foo = {
        address: wethAddress,
        symbol: 'WETH',
        decimal: 18
      };

      const balance = await shepherdProvider.getTokenBalance(
        '0xC9aF17853600357BC89005291b85fAb4CCd2F198',
        foo
      );

      // MM
      // 0xc9af17853600357bc89005291b85fab4ccd2f198

      console.log('\n\n\n', 'order.makerTokenAmount', order.makerTokenAmount.toString(), '\n\n\n');
      console.log('\n\n\n', 'balance', balance.balance.toString(), '\n\n\n');
      console.log('\n\n\n', 'wethAddress', wethAddress, '\n\n\n');
      console.log('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');

      // Sign order
      const orderHash = ZeroEx.getOrderHashHex(order);

      const shouldAddPersonalMessagePrefix = true;
      console.log('d');
      const ecSignature = await this.exchanger.instance.signOrderHashAsync(
        orderHash,
        makerAddress,
        shouldAddPersonalMessagePrefix
      );
      const signedOrder = {
        ...order,
        ecSignature
      };
      console.log('e');
      await this.exchanger.instance.exchange.validateOrderFillableOrThrowAsync(signedOrder);

      console.log('We good.');
    } catch (e) {
      console.log('We bad.');
      console.error(e);
    }
  };

  render() {
    return (
      <TabSection>
        <h1>Exchange</h1>
        <button onClick={this.exchange}>Go!</button>
      </TabSection>
    );
  }
}
