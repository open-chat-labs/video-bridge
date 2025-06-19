export const idlFactory = ({ IDL }) => {
  const ChannelId = IDL.Nat32;
  const MessageId = IDL.Nat64;
  const Milliseconds = IDL.Nat64;
  const UserId = IDL.Principal;
  const OCError = IDL.Tuple(IDL.Nat16, IDL.Opt(IDL.Text));
  const StartVideoCallResponse = IDL.Variant({
    Error: OCError,
    Success: IDL.Null,
  });
  const EndVideoCallResponse = IDL.Variant({
    Error: OCError,
    Success: IDL.Null,
  });
  const VideoCallType = IDL.Variant({
    Default: IDL.Null,
    Broadcast: IDL.Null,
  });
  const EndVideoCallArgs = IDL.Record({
    channel_id: ChannelId,
    message_id: MessageId,
  });
  const StartVideoCallArgs = IDL.Record({
    initiator_username: IDL.Text,
    channel_id: ChannelId,
    initiator: UserId,
    max_duration: IDL.Opt(Milliseconds),
    initiator_display_name: IDL.Opt(IDL.Text),
    message_id: MessageId,
    call_type: VideoCallType,
  });
  return IDL.Service({
    end_video_call_v2: IDL.Func([EndVideoCallArgs], [EndVideoCallResponse], []),
    start_video_call_v2: IDL.Func(
      [StartVideoCallArgs],
      [StartVideoCallResponse],
      [],
    ),
  });
};
