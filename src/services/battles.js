import { addHours, format } from 'date-fns';
import find from 'lodash/find';
import map from 'lodash/map';
import get from 'lodash/get';
import padStart from 'lodash/padStart';

export const BATTLE_HOUR = parseInt(process.env.BATTLE_HOUR || '1', 0);
export const CASTLES_HASH = JSON.parse(process.env.CASTLES);

const CASTLES = map(CASTLES_HASH, (castle, code) => ({ castle, code }));

export function castleCode(castle) {
  return get(find(CASTLES, { castle }), 'code');
}

export function castleByCode(code) {
  return CASTLES_HASH[code];
}

export function dateFormat(date) {
  return `${battleIcon(date)} ${dayPart(date)}`;
}

export function dayPart(date) {
  return format(date, 'DD/MM');
}

export function dayTime(date) {
  return format(date, 'hh:mm DD/MM');
}

export function battleIcon(date) {
  const num = date.getUTCHours() / 8;
  return ['🌚', '🌝', '🌞'][num];
}

export function battleDate(reportDate) {

  const date = addHours(reportDate, BATTLE_HOUR);
  const hours = Math.floor(date.getUTCHours() / 8) * 8;

  date.setUTCHours(hours);
  date.setSeconds(0);
  date.setMinutes(0);
  date.setMilliseconds(0);

  return date;

}

export function dateCode(date) {
  const uh = date.getUTCHours();
  return `${format(date, 'YYMMDD')}_${padStart(uh, 2, '0')}`;
}

export function prevDate(date) {
  return addHours(date, -8);
}

export function nextDate(date) {
  return addHours(date, 8);
}