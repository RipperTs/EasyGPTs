import { MongoOutLink } from './schema';

export const addOutLinkUsage = async ({
  shareId,
  totalPoints
}: {
  shareId: string;
  totalPoints: number;
}) => {
  MongoOutLink.findOneAndUpdate(
    { shareId },
    {
      $inc: { usagePoints: totalPoints },
      lastTime: new Date()
    }
  ).catch((err) => {
    console.log('update shareChat error', err);
  });
};
