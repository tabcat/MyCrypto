enum RequestTypes {
  GET_ADDRESSES = 'get-addresses',
  SIGN_TRANSACTION = 'sign-transaction'
}

interface IRequestFields {
  id: string;
  type: RequestTypes;
  args?: object;
}

interface IGetAddressesRequest extends IRequestFields {
  type: RequestTypes.GET_ADDRESSES;
  args: {
    walletType: string;
  };
}

interface ISignTransactionRequest extends IRequestFields {
  type: RequestTypes.SIGN_TRANSACTION;
  args: {
    r: string;
    s: string;
    v: string;
  };
}

type IRequest = IGetAddressesRequest | ISignTransactionRequest;

interface IResponseFields {
  id: string;
  type: RequestTypes;
  data: object;
}

interface IGetAddressesResponse extends IResponseFields {
  type: RequestTypes.GET_ADDRESSES;
  data: {
    addresses: string[];
  };
}

interface ISignTransactionRequest extends IResponseFields {
  type: RequestTypes.SIGN_TRANSACTION;
  data: {
    signedTransaction: string;
  };
}

type IResponse = IGetAddressesResponse | ISignTransactionRequest;

window.addEventListener('message', (ev: MessageEvent) => {
  // Only take in messages from the webview
  if (ev.origin !== window.location.origin) {
    return;
  }

  try {
    const request = JSON.parse(ev.data);
    if (request && request.type && Object.values(RequestTypes).includes(request.type)) {
      const responseData = processRequest(request as IRequest);
      console.log('processed', responseData);
      if (responseData) {
        respondToRequest(request, responseData);
      }
    }
  } catch (err) {
    // no-op, not meant for us
  }
});

function respondToRequest(request: IRequest, data: any) {
  const response = {
    data,
    id: request.id,
    type: request.type
  };
  window.postMessage(JSON.stringify(response), window.location.origin);
  console.log('Replied');
}

// Process requests is kind of a reducer style switch case statement that
// delegates to functions per request, and optionally returns some data
function processRequest(request: IRequest): any {
  switch (request.type) {
    case RequestTypes.GET_ADDRESSES:
      return getAddresses(request.args);
    case RequestTypes.SIGN_TRANSACTION:
      return signTransaction(request.args);
  }
}

function getAddresses({ walletType }: IGetAddressesRequest['args']): IGetAddressesResponse['data'] {
  return {
    addresses: ['test1', 'test2']
  };
}

function signTransaction({
  r,
  s,
  v
}: ISignTransactionRequest['args']): ISignTransactionRequest['data'] {
  return {
    signedTransaction: 'test'
  };
}
