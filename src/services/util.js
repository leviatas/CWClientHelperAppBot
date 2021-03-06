import replace from 'lodash/replace';
import escapeRegExp from 'lodash/escapeRegExp';
import lo from 'lodash';

const MAX_REGEX_LENGTH = 50;
const BILLIONS = 1000000.0;
const THOUSANDS = 1000.0;

const HTML_REPLACERS = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

export function numberKM(exp) {
  return exp > BILLIONS ? `${lo.round(exp / THOUSANDS, 0)}K` : (exp || 0);
}

export function escapeName(name) {
  return name
    .replace(/[&<>]/g, x => HTML_REPLACERS[x]);
}

export function searchRe(text) {

  if (text.length > MAX_REGEX_LENGTH) {
    throw new Error(`${text.length} symbols is too much for a filter`);
  }

  const isRe = text.match(/\/(.+)\//);

  const reText = isRe ? isRe[1] : replace(escapeRegExp(text), /[ _]/g, '.+');

  return new RegExp(reText, 'i');

}


export async function isChatAdmin(ctx) {
  const { chat, from } = ctx;
  if (chat.id === from.id) {
    return true;
  }
  const admins = await ctx.telegram.getChatAdministrators(chat.id);
  return !!lo.find(admins, { user: { id: from.id } });
}
