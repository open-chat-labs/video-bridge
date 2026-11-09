// See app.service.decline.spec.ts: the real OpenChat service can't be resolved by jest
jest.mock('./openchat/openchat.service', () => ({
  OpenChatService: class {},
}));

import { AppService } from './app.service';
import { InProgressService } from './inprogress/inprogress.service';

const ROOM = 'room';

// The parts of the mongoose model the service uses, over a map
function fakeModel() {
  const records = new Map<string, Record<string, unknown>>();
  const exec = <T>(value: T) => ({ exec: async () => value });
  return {
    records,
    updateOne: (
      { roomName }: { roomName: string },
      update: Record<string, unknown>,
      options?: { upsert?: boolean },
    ) => {
      const existing = records.get(roomName);
      if (existing !== undefined) {
        records.set(roomName, { ...existing, ...update });
      } else if (options?.upsert) {
        records.set(roomName, { roomName, ...update });
      }
      return exec({ acknowledged: true });
    },
    find: () => exec([...records.values()]),
    findOne: ({ roomName }: { roomName: string }) =>
      exec(records.get(roomName)),
    deleteOne: ({ roomName }: { roomName: string }) => {
      records.delete(roomName);
      return exec({ acknowledged: true });
    },
  };
}

function setup(
  duringPresenceRequest: (model: ReturnType<typeof fakeModel>) => void,
) {
  const model = fakeModel();
  model.records.set(ROOM, {
    roomName: ROOM,
    messageId: '1',
    startedBy: 'caller',
    confirmed: false,
    callType: 'Audio',
  });
  global.fetch = jest.fn(async () => {
    duringPresenceRequest(model);
    return {
      ok: true,
      json: async () => ({ [ROOM]: [{ userId: 'caller' }] }),
    } as Response;
  }) as unknown as typeof fetch;
  const service = new AppService(
    new InProgressService(model as any),
    { get: () => 'x' } as any,
    {} as any,
  );
  return { service, model };
}

describe('the presence check', () => {
  it('confirms a call that Daily says is occupied', async () => {
    const { service, model } = setup(() => undefined);
    await service.checkGlobalPresence();
    expect(model.records.get(ROOM)?.confirmed).toBe(true);
    expect(model.records.get(ROOM)?.callType).toBe('Audio');
  });

  it('does not bring back a call that finished while it ran', async () => {
    const { service, model } = setup((m) => m.records.delete(ROOM));
    await service.checkGlobalPresence();
    expect(model.records.has(ROOM)).toBe(false);
  });
});
