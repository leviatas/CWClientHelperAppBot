import CWExchange, * as CW from 'cw-rest-api';
import map from 'lodash/map';
import keyBy from 'lodash/keyBy';

import { consumeOffers } from '../consumers/offersConsumer';

import { hgetAsync } from './redis';
import log from './log';

const { debug } = log('cw');

export const CW_BOT_ID = parseInt(process.env.CW_BOT_ID, 0);

const fanouts = { [CW.QUEUE_OFFERS]: consumeOffers };

export const cw = CW_BOT_ID && new CWExchange({ bindIO: true, fanouts, noAck: true });

export const itemsByName = CW.allItemsByName();
export const itemsByCode = keyBy(map(itemsByName, (code, name) => ({ name, code })), 'code');

if (CW_BOT_ID) {
  debug('Started CW API', CW_BOT_ID);
}

export async function pricesByItemName(itemName) {

  const prices = await hgetAsync(CW.QUEUE_SEX, itemKey(itemName));

  return JSON.parse(prices);

}

export async function pricesByItemCode(itemCode) {

  const { name: itemName } = itemsByCode[itemCode] || {};

  if (!itemName) {
    throw new Error(`No itemKey for code "${itemCode}"`);
  }

  debug('pricesByItemCode', itemCode, itemName);

  return pricesByItemName(itemName);

}

export function itemKey(name) {
  return name.replace(/ /g, '_').toLowerCase();
}

export function itemNameByCode(code) {
  const item = itemsByCode[code];
  return item && item.name;
}
