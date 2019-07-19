import map from 'lodash/map';
import get from 'lodash/get';
import uniq from 'lodash/uniq';
import groupBy from 'lodash/groupBy';
import orderBy from 'lodash/orderBy';
import maxBy from 'lodash/maxBy';
import sumBy from 'lodash/sumBy';
import mapKeys from 'lodash/mapKeys';
import filter from 'lodash/filter';
import last from 'lodash/last';
import { format, addDays } from 'date-fns';

import log from '../services/log';
import Duel from '../models/Duel';
// import { refreshProfile } from '../services/auth';
import User from '../models/User';
import * as ar from '../services/arena';
import { LEVEL_ICON } from './profile';

const { debug, error } = log('mw:arena');

const DUEL_RESET_HOUR = parseFloat(process.env.DUEL_RESET_HOUR) || 10.25;

export async function arena(ctx) {

  const { from: { id: fromUserId }, message } = ctx;
  const { match, state: { match: stateMatch } } = ctx;
  const [, name, shiftParam = '0', shiftHigh = shiftParam] = stateMatch || match;

  let { cwId } = ctx.state;

  debug(fromUserId, message.text, `"${name || cwId}"`, shiftParam, shiftHigh);

  await ctx.replyWithChatAction('typing');

  try {

    const shift = parseInt(shiftParam, 0) || 0;
    const shiftTo = shiftHigh ? parseInt(shiftHigh, 0) : shift;
    const [, tag] = name.match(/\[(.+)\]/) || [];

    if (shift < shiftTo) {
      await ctx.replyWithHTML(`Invalid param <b>${shift}</b> less than <b>${shiftTo}</b>`);
      return;
    }

    if (tag) {

      const { period, res: data } = await guildDuels(tag, shift, shiftTo);

      const reply = [
        `<b>[${tag}]</b> duels ${period}\n`,
        ...map(data, formatGuildMemberDuels),
        `\n<b>${data.length}</b> active fighters won ${formatGuildTotalDuels(data)}`,
      ];

      await ctx.replyWithHTML(reply.join('\n'));

    } else {

      if (!cwId) {
        cwId = ar.lastKnownUserID(name);
      }

      if (!cwId) {
        await ctx.replyWithHTML(formatDuels([], cwId, name));
        return;
      }

      const cond = {
        ...duelTimeFilter(shift, shiftTo),
        'players.id': cwId,
      };

      const data = await Duel.find(cond).sort('-ts');

      await ctx.replyWithHTML(formatDuels(data, cwId, name));

    }

    debug('GET /du', name);

  } catch (e) {
    error(e.message);
    ctx.replyError('/du', e);
  }

}

export async function ownArena(ctx) {

  const { from: { id: fromUserId }, message, session } = ctx;
  const [, shiftParam, shiftHigh] = ctx.match || [message.text];

  const dug = /^\/dug( |@|$)/.test(message.text);

  debug('ownArena', message.text);

  let name = '';

  if (session.auth) {

    const user = await User.findOne({ id: fromUserId });

    if (!user) {
      await ctx.replyWithHTML('Click /hello to update your game info then try /du again');
      return;
    }

    if (user) {
      const { profile } = user;
      name = dug ? `[${profile.guild_tag}]` : profile.userName;
    }

    if (!dug) {
      ctx.state.cwId = session.auth.id;
    }

  }

  if (!name && !ctx.state.cwId) {
    await replyHelp(ctx);
    return;
  }

  ctx.state.match = [message.text, name, shiftParam, shiftHigh];

  await arena(ctx);

}

function duelKey(nameOrTag) {
  const tag = nameOrTag.match(/\[(.+)]/);
  return tag ? { tag: tag[1] } : { name: nameOrTag };
}

function fpMapKeys(mapper) {
  return obj => mapKeys(obj, mapper);
}

export async function vsArena(ctx) {

  const { match } = ctx;

  const [, p1, p2] = match || [];

  const winner = fpMapKeys((val, key) => `winner.${key}`);
  const loser = fpMapKeys((val, key) => `loser.${key}`);

  const p1Key = duelKey(p1);
  const p2Key = duelKey(p2);

  debug('vsArena', p1Key, p2Key);

  const p1Won = await Duel.find({
    ...winner(p1Key),
    ...loser(p2Key),
  });

  const p2Won = await Duel.find({
    ...winner(p2Key),
    ...loser(p1Key),
  });

  const total = p2Won.length + p1Won.length;

  if (!total) {
    await ctx.replyWithHTML(`Not found duels of <b>${p1}</b> vs <b>${p2}</b>`);
    return;
  }

  let wonTimes = p1Won.length ? `won <b>${p1Won.length}</b> times` : 'never won';

  if (p1Won.length === 1) {
    wonTimes = 'won only <b>once</b>';
  }

  const title = [
    `<b>${p1}</b>`,
    wonTimes,
    `over <b>${p2}</b> in <b>${total}</b> duel${total > 1 ? 's' : ''}`,
  ];

  const reply = [
    title.join(' '),
  ];

  if ((p2Key.tag && !p1Key.tag) || (p1Key.tag && !p2Key.tag)) {

    const key1 = p2Key.tag ? 'loser' : 'winner';
    const key2 = p2Key.tag ? 'winner' : 'loser';

    const p1WonGrouped = groupBy(p1Won, ({ [key1]: { name } }) => name);
    const p2WonGrouped = groupBy(p2Won, ({ [key2]: { name } }) => name);

    const opponents = orderBy(uniq([
      ...Object.keys(p1WonGrouped),
      ...Object.keys(p2WonGrouped),
    ]));

    const winRates = map(opponents, name => {
      const winCount = get(p1WonGrouped[name], 'length') || 0;
      const loseCount = get(p2WonGrouped[name], 'length') || 0;
      return `${name}: <b>${winCount}</b>/<b>${loseCount}</b>`;
    });

    reply.push(
      '',
      ...winRates,
    );

  }

  await ctx.replyWithHTML(reply.join('\n'));

}


function replyHelp(ctx) {
  const help = [
    'Try /du username or /du [TAG] (case sensitive)',
    'Authorize this bot with /auth to use /du without params for you or /dug for your guild',
  ];
  return ctx.replyWithHTML(help.join(' '));
}

function formatGuildTotalDuels(duels) {
  return `<b>${sumBy(duels, 'won') || 0}</b> lost <b>${sumBy(duels, 'lost') || 0}</b>`;
}

function formatGuildMemberDuels(duels) {
  const {
    name,
    won,
    lost,
    level,
  } = duels;
  return `<code>${level}</code> ${name}: <b>${won}</b>/<b>${lost}</b>`;
}


function formatPeriod(duels) {

  const { ts: maxTs } = duels[0];
  const { ts: minTs } = last(duels);

  const minDate = dateFormat(minTs);
  const maxDate = dateFormat(maxTs);

  return minDate !== maxDate
    ? `from <b>${minDate}</b> to <b>${maxDate}</b>` : `on <b>${minDate}</b>`;

}


async function guildDuels(tag, shift, shiftTo) {

  const cond = { 'players.tag': tag };

  const tf = duelTimeFilter(shift, shiftTo);

  Object.assign(cond, tf);

  const duels = await Duel.find(cond);

  if (!duels.length) {
    throw new Error('not found duels');
  }

  const named = map(duels, duel => {

    const { winner, loser } = duel;
    const isWinner = winner.tag === tag;
    const name = isWinner ? winner.name : loser.name;
    const result = isWinner ? 'won' : 'lost';
    const opponentName = isWinner ? loser.name : winner.name;
    const level = isWinner ? winner.level : loser.level;

    return {
      ...duel,
      name,
      result,
      opponentName,
      level,
    };

  });

  const res = map(groupBy(named, 'name'), (nameDuels, name) => {
    const { won = [], lost = [] } = groupBy(nameDuels, 'result');
    const { level } = maxBy(nameDuels, 'level');
    return {
      name,
      level,
      won: won.length,
      lost: lost.length,
    };
  });

  const period = formatPeriod(duels);

  return { period, res: orderBy(res, ['level', 'name'], ['desc', 'asc']) };

}


function duelTimeFilter(shift, shiftTo = shift) {

  const today = addDays(new Date(), -shiftTo);
  let $lt = addDays(new Date(), -shiftTo);

  const hours = Math.floor(DUEL_RESET_HOUR);
  const minutes = (DUEL_RESET_HOUR - hours) * 60;

  $lt.setHours(hours, minutes, 0, 0);

  if ($lt < today) {
    $lt = addDays($lt, 1);
  }

  const $gt = addDays($lt, shiftTo - shift - 1);

  debug('duelTimeFilter', shift, shiftTo, $gt, $lt);

  return { ts: { $gt, $lt } };

}

function dateFormat(date) {
  return format(date, 'D/MM');
}


function formatDuels(duels, id, primaryName) {

  if (!duels.length) {
    return `Duels of <b>${primaryName}</b> not found`;
  }

  const opponents = duelOpponents();

  const wonOver = filter(opponents, 'isWinner');
  const lostTo = filter(opponents, { isWinner: false });

  const { ts: maxTs, winner: duelWinner, loser: duelLoser } = duels[0];
  const { ts: minTs } = last(duels);

  const duelPlayer = duelWinner.id === id ? duelWinner : duelLoser;

  const minDate = dateFormat(minTs);
  const maxDate = dateFormat(maxTs);

  const period = minDate !== maxDate
    ? `from <b>${minDate}</b> to <b>${maxDate}</b>` : `on <b>${minDate}</b>`;

  const { tag, level, name } = duelPlayer;

  return [
    `${LEVEL_ICON}${level} <b>${tag ? `[${tag}] ` : ''}${name}</b> duels ${period}`,
    `Won${opponentList(wonOver)}`,
    `Lost${opponentList(lostTo)}`,
  ].join('\n\n');

  function duelOpponents() {

    return filter(map(duels, duel => {

      const { winner, loser, isChallenge } = duel;

      const isWinner = winner.id === id;

      const player = isWinner ? winner : loser;
      const opponent = isWinner ? loser : winner;

      const { hp: undamaged } = opponent;

      return {
        isWinner,
        ...opponent,
        isChallenge,
        undamaged,
        saved: player.hp,
      };

    }));

  }


}


function opponentList(opponents) {

  if (!opponents.length) {
    return ': none';
  }

  const res = [
    ` (<b>${opponents.length}</b>):`,
    '',
  ];

  if (opponents.length > 10) {
    res.push(...opponentsCastles(opponents));
  } else {
    res.push(...map(opponents, opponentFormat));
  }

  return res.join('\n');

}


function opponentFormat(duel) {

  const { castle, tag, name } = duel;
  const { isChallenge } = duel;

  return filter([
    '\t',
    isChallenge ? '🤺‍' : '',
    castle,
    tag ? `[${tag}]` : '',
    name,
  ]).join(' ');

}

function opponentsCastles(opponents) {

  const byCastle = groupBy(opponents, 'castle');

  const data = map(byCastle, (duels, key) => ({
    text: `${key} : ${duels.length}`,
    key,
    count: duels.length,
  }));

  return map(orderBy(data, ['count'], ['desc']), 'text');

}
