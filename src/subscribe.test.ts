import {
  subscribe,
} from './subscribe';
import {
  type Trigger,
  type WatchmanClient,
} from './types';
import {
  setTimeout,
} from 'node:timers';
import * as sinon from 'sinon';
import {
  expect,
  it,
} from 'vitest';

const wait = (time: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
};

const createAbortController = () => {
  const abortController = new AbortController();

  setTimeout(() => {
    abortController.abort();
  }, 100);

  return abortController;
};

it('rejects promise if Watchman "subscribe" command produces an error', async () => {
  const client = {
    command: () => {},
  } as unknown as WatchmanClient;
  const trigger = {} as Trigger;

  const clientMock = sinon.mock(client);

  clientMock
    .expects('command')
    .once()
    .callsFake((args, callback) => {
      callback(new Error('foo'));
    });

  await expect(subscribe(client, trigger)).rejects.toThrowError('foo');

  expect(clientMock.verify());
});

it('evaluates onChange', async () => {
  const client = {
    command: () => {},
    on: () => {},
  } as unknown as WatchmanClient;
  const trigger = {
    id: 'foo',
    name: 'foo',
    onChange: () => {},
  } as unknown as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  subscriptionMock.expects('onChange').once().resolves(null);

  const abortController = createAbortController();

  const clientMock = sinon.mock(client);

  clientMock
    .expects('on')
    .once()
    .callsFake((event, callback) => {
      callback({
        files: [],
        subscription: 'foo',
      });
    });

  await subscribe(client, trigger, abortController.signal);

  expect(clientMock.verify());
  expect(subscriptionMock.verify());
});

it('evaluates multiple onChange', async () => {
  const client = {
    command: () => {},
    on: () => {},
  } as unknown as WatchmanClient;
  const trigger = {
    id: 'foo',
    name: 'foo',
    onChange: () => {},
    retry: {
      retries: 0,
    },
  } as unknown as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  const onChange = subscriptionMock.expects('onChange').thrice();

  const abortController = new AbortController();

  onChange.onFirstCall().resolves(null);

  onChange.onSecondCall().resolves(null);

  onChange.onThirdCall().callsFake(() => {
    abortController.abort();

    return Promise.resolve(null);
  });

  const clientMock = sinon.mock(client);

  clientMock
    .expects('on')
    .callsFake((event, callback) => {
      callback({
        files: [],
        subscription: 'foo',
      });
      setTimeout(() => {
        callback({
          files: [],
          subscription: 'foo',
        });
        setTimeout(() => {
          callback({
            files: [],
            subscription: 'foo',
          });
        });
      });
    });

  await subscribe(client, trigger, abortController.signal);

  expect(onChange.callCount).toBe(3);
});

it('waits for onChange to complete when { interruptible: false }', async () => {
  const client = {
    command: () => {},
    on: () => {},
  } as unknown as WatchmanClient;
  const trigger = {
    id: 'foo',
    interruptible: false,
    name: 'foo',
    onChange: () => {},
    retry: {
      retries: 0,
    },
  } as unknown as Trigger;

  const abortController = new AbortController();

  const triggerMock = sinon.mock(trigger);

  const onChange = triggerMock.expects('onChange').twice();

  let completed = false;

  onChange.onFirstCall().callsFake(async () => {
    await wait(100);

    completed = true;
  });

  onChange.onSecondCall().callsFake(() => {
    expect(completed).toBe(true);

    abortController.abort();
  });

  const clientMock = sinon.mock(client);

  clientMock
    .expects('on')
    .callsFake((event, callback) => {
      callback({
        files: [],
        subscription: 'foo',
      });
      callback({
        files: [],
        subscription: 'foo',
      });
    });

  await subscribe(client, trigger, abortController.signal);

  expect(onChange.callCount).toBe(2);
});

it('throws if onChange produces an error', async () => {
  const client = {
    command: () => {},
    on: () => {},
  } as unknown as WatchmanClient;
  const trigger = {
    id: 'foo',
    name: 'foo',
    onChange: () => {},
    retry: {
      retries: 0,
    },
  } as unknown as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  subscriptionMock.expects('onChange').rejects(new Error('foo'));

  const abortController = createAbortController();

  const clientMock = sinon.mock(client);

  clientMock
    .expects('on')
    .callsFake((event, callback) => {
      callback({
        files: [],
        subscription: 'foo',
      });
    });

  await expect(subscribe(client, trigger, abortController.signal)).rejects.toThrowError('foo');
});

it('retries failing routines', async () => {
  const client = {
    command: () => {},
    on: () => {},
  } as unknown as WatchmanClient;
  const trigger = {
    id: 'foo',
    name: 'foo',
    onChange: () => {},
    retry: {
      retries: 1,
    },
  } as unknown as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  const onChange = subscriptionMock.expects('onChange');

  onChange.onFirstCall().rejects(new Error('foo'));
  onChange.onSecondCall().resolves('bar');

  const abortController = createAbortController();

  const clientMock = sinon.mock(client);

  clientMock
    .expects('on')
    .callsFake((event, callback) => {
      callback({
        files: [],
        subscription: 'foo',
      });
    });

  await subscribe(client, trigger, abortController.signal);
});

it('reports { first: true } only for the first event', async () => {
  const client = {
    command: () => {},
    on: () => {},
  } as unknown as WatchmanClient;
  const trigger = {
    id: 'foo',
    onChange: () => {},
  } as unknown as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  const onChange = subscriptionMock.expects('onChange').twice().resolves(null);

  const abortController = createAbortController();

  const clientMock = sinon.mock(client);

  clientMock.expects('on').callsFake((event, callback) => {
    callback({
      files: [],
      subscription: 'foo',
    });
    callback({
      files: [],
      subscription: 'foo',
    });
  });

  await subscribe(client, trigger, abortController.signal);

  expect(onChange.args).toMatchObject([
    [
      {
        first: true,
      },
    ],
    [
      {
        first: false,
      },
    ],
  ]);

  expect(subscriptionMock.verify());
});
