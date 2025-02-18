export type UpdateChatFeedbackProps = {
  appId: string;
  chatId: string;
  chatItemId: string;
  shareId?: string;
  teamId?: string;
  teamToken?: string;
  outLinkUid?: string;
  userBadFeedback?: string;
  userGoodFeedback?: string;
};

export type V2UpdateChatFeedbackProps = OutLinkChatAuthProps & {
  appId: string;
  chatId: string;
  dataId: string;
  userBadFeedback?: string;
  userGoodFeedback?: string;
};
