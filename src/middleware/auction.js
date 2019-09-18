import * as a from '../services/auction';
import Auction from '../models/Auction';
import log from '../services/log';

const { debug } = log('mw:au');

export async function showItem(ctx) { // eslint-disable-line

  const { message: { text: command }, match } = ctx;
  const [, lotId] = match;

  debug('showItem:', command);

  const item = await Auction.findOne({ lotId });

  if (!item) {
    await ctx.replyWithHTML(`Lot <code>${lotId}</code> not found`);
    return;
  }

  await ctx.replyWithHTML(a.auctionItemView(item));

}
