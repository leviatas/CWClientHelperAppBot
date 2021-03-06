import log from '../services/log';
import Shop from '../models/Shop';

const { debug, error } = log('yp');

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

    const lastOpened = new Date();

    const ops = digest.map(item => {

      const query = { _id: item.link };

      return {
        updateOne: {
          filter: query,
          update: {
            $set: {
              castleDiscount: 0,
              guildDiscount: 0,
              ...item,
              lastOpened,
            },
            $currentDate: { ts: true },
            // $setOnInsert: { cts },
          },
          upsert: true,
        },
      };

    });

    await Shop.bulkWrite(ops, { ordered: false });

    if (ack) {
      ack();
    }

  } catch ({ name, message }) {
    error(name, message);
  }

}
