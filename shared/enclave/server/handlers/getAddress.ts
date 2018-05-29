import { getWalletLib } from 'shared/enclave/server/wallets';
import { GetAddressParams, GetAddressResponse } from 'shared/enclave/types';

export default function(params: GetAddressParams): Promise<GetAddressResponse> {
  const wallet = getWalletLib(params.walletType);
  return wallet.getAddress(params.index, params.dpath);
}
