import { Actor, HttpAgent, type Identity } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';
import { toCanisterResponseError } from './error';

export abstract class CandidService {
  protected createServiceClient<T>(
    factory: IDL.InterfaceFactory,
    canisterId: string,
    host: string,
  ): T {
    const agent = new HttpAgent({
      identity: this.identity,
      host,
      retryTimes: 5,
    });
    const isMainnet = host.includes('icp-api.io');
    if (!isMainnet) {
      agent.fetchRootKey();
    }
    return Actor.createActor<T>(factory, {
      agent,
      canisterId,
    });
  }

  protected handleResponse<From, To>(
    service: Promise<From>,
    mapper: (from: From) => To,
    args?: unknown,
  ): Promise<To> {
    return service.then(mapper).catch((err) => {
      console.log(err, args);
      throw toCanisterResponseError(err as Error);
    });
  }

  constructor(protected identity: Identity) {}
}
