export const idlFactory = ({ IDL }) => {
  const MessageId = IDL.Nat64;
  const Milliseconds = IDL.Nat64;
  const UserId = IDL.Principal;
  const VideoCallType = IDL.Variant({
    Default: IDL.Null,
    Broadcast: IDL.Null,
  });
  const EndVideoCallArgs = IDL.Record({ message_id: MessageId });
  const EndVideoCallResponse = IDL.Variant({
    AlreadyEnded: IDL.Null,
    MessageNotFound: IDL.Null,
    Success: IDL.Null,
  });
  const StartVideoCallArgs = IDL.Record({
    initiator_username: IDL.Text,
    initiator: UserId,
    max_duration: IDL.Opt(Milliseconds),
    initiator_display_name: IDL.Opt(IDL.Text),
    message_id: MessageId,
    call_type: VideoCallType,
  });
  const StartVideoCallResponse = IDL.Variant({
    NotAuthorized: IDL.Null,
    Success: IDL.Null,
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
