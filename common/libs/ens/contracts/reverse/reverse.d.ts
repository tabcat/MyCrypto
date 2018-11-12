import { ABIFunc, ABIFuncParamless } from '../AbiFunc';

export interface IReverse {
  ens: ABIFuncParamless<{ ensAddress: address }>;
  setName: ABIFunc<{ name: string }, { node: bytes32 }>;
  name: ABIFunc<{ '0': bytes32 }, { name: string }>;
}

type bytes32 = any;
type address = any;
