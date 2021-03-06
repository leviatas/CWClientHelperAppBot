import log from '../services/log';
import Auction from '../models/Auction';

const { debug, error } = log('au');

const isNumber = /^\d+$/;

export default async function (msg, ack) {

  const { fields, properties: { timestamp }, content } = msg;
  const { deliveryTag } = fields;
  const ts = isNumber.test(timestamp) ? new Date(timestamp * 1000) : new Date();
  const data = content.toString();
  const digest = JSON.parse(data);

  debug('consumed', `#${deliveryTag}`, ts, `(${digest.length})`);

  try {

    debug(digest[0]);

    const ops = digest.map(item => {

      const query = { lotId: item.lotId };

      const $set = { ...item };

      if ($set.finishedAt === '0001-01-01T00:00:00Z') {
        $set.finishedAt = null;
      }

      return {
        updateOne: {
          filter: query,
          update: {
            $set,
            $currentDate: { ts: true },
            // $setOnInsert: { cts },
          },
          upsert: true,
        },
      };

    });

    await Auction.bulkWrite(ops, { ordered: false });

    if (ack) {
      ack();
    }
  } catch ({ name, message }) {
    error(name, message);
  }

}
