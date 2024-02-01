export type TokenPayload = {
  userId: string;
  username: string;
  chatId: string;
  exp: number;
};

// Do we actually need any of this or do we just need a Set<string> to record all of the rooms that have participants

export type RoomPresence = {
  room: 'cbopz-duaaa-aaaaa-qaaka-cai';
  id: '9035da22-a257-45fb-be23-1ed2c5d36d71';
  userId: 'dfdal-2uaaa-aaaaa-qaama-cai';
  userName: 'julian_jelfs';
  joinTime: '2024-02-01T16:57:07.000Z';
  duration: 53;
};

export type PresenceData = Record<string, RoomPresence>;
