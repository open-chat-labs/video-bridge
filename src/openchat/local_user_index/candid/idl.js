export const idlFactory = ({ IDL }) => {
  const UserId = IDL.Principal;
  const ChatId = IDL.Principal;
  const CommunityId = IDL.Principal;
  const ChannelId = IDL.Nat32;
  const MessageId = IDL.Nat64;
  const OCError = IDL.Tuple(IDL.Nat16, IDL.Opt(IDL.Text));
  const Chat = IDL.Variant({
    Direct: ChatId,
    Group: ChatId,
    Channel: IDL.Tuple(CommunityId, ChannelId),
  });
  const VideoCallDeclinedArgs = IDL.Record({
    user_id: UserId,
    chat_id: Chat,
    message_id: MessageId,
  });
  const UnitResult = IDL.Variant({
    Error: OCError,
    Success: IDL.Null,
  });
  return IDL.Service({
    video_call_declined: IDL.Func([VideoCallDeclinedArgs], [UnitResult], []),
  });
};
