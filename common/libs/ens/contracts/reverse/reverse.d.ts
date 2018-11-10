import { ABIFunc, ABIFuncParamless } from '../AbiFunc';

export interface IReverse {
  ens: ABIFuncParamless<{ ensAddress: address }>;
  setName: ABIFuncParamless<{ node: bytes32; _name: string }>;
  name: ABIFunc<{ '0': bytes32 }, { name: string }>;
}

type bytes32 = any;
type address = any;
