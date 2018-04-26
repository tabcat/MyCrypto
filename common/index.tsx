// Application styles must come first in order, to allow for overrides
import 'font-awesome/scss/font-awesome.scss';
import 'sass/styles.scss';
import 'babel-polyfill';
import 'whatwg-fetch';
import React from 'react';
import { render } from 'react-dom';
import Root from './Root';
import { configuredStore } from './store';
import consoleAdvertisement from './utils/consoleAdvertisement';

const appEl = document.getElementById('app');

render(<Root store={configuredStore} />, appEl);

if (module.hot) {
  module.hot.accept('reducers', () => configuredStore.replaceReducer(require('reducers')));

  module.hot.accept('./Root', () => {
    render(<Root store={configuredStore} />, appEl);
  });
}

if (process.env.NODE_ENV === 'production') {
  consoleAdvertisement();
}

/////////////////// Not typed yet, but works with preload/index.ts

if (typeof window !== 'undefined') {
  let idCount = 0;
  const requestResponses: { [id: string]: any } = {};

  (window as any).sendRequest = (type: string, args: object): Promise<any> => {
    return new Promise((resolve, reject) => {
      const id = idCount++;
      const request = JSON.stringify({ id, type, args });
      let hasResolved = false;

      window.postMessage(request, window.location.origin);

      const checkInterval: NodeJS.Timer = setInterval(() => {
        if (hasResolved) {
          return clearInterval(checkInterval);
        }
        if (requestResponses[id]) {
          resolve(requestResponses[id]);
          hasResolved = true;
          delete requestResponses[id];
        }
      }, 50);

      setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          reject(new Error('Timeout'));
        }
      }, 30000);
    });
  };

  window.addEventListener('message', ev => {
    // Only take in messages from preload
    if (ev.origin !== window.location.origin) {
      return;
    }

    try {
      const response = JSON.parse(ev.data);
      if (response && response.id && response.type && response.data) {
        console.log('response', response);
        requestResponses[response.id] = response;
      }
    } catch (err) {
      // no-op, not meant for us
    }
  });
}
