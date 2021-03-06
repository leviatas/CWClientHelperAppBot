import filter from 'lodash/filter';
import mapValues from 'lodash/mapValues';
import diffMinutes from 'date-fns/difference_in_minutes';
import { eachSeriesAsync, mapSeriesAsync } from 'sistemium-telegram/services/async';

import User from '../models/User';
import {
  getToken, refreshProfile, safeUserId, rmAuth,
} from './auth';

import log from './log';
import { cw } from './cw';

const { debug, error } = log('users');

const PROFILE_EXPIRE = parseInt(process.env.PROFILE_EXPIRE, 0) || 60;

export async function getAuthorizedUsers({ profile }) {

  if (!profile) {
    return [];
  }

  const { guild_tag: tag } = profile;

  if (!tag) {
    return [];
  }

  return guildUsersWithRefresh(tag);

}

export async function guildUsers(tag) {
  return User.find({ 'profile.guild_tag': tag })
    .sort({ 'profile.userName': 1, id: 1 });
}

export async function guildUsersWithRefresh(tag) {

  const users = await guildUsers(tag);

  const now = new Date();

  const toUpdate = filter(users, ({ ts }) => {
    // debug(ts, diffMinutes(now, ts));
    return !ts || diffMinutes(now, ts) > PROFILE_EXPIRE;
  });

  debug('getAuthorizedUsers', tag, toUpdate.length);

  eachSeriesAsync(toUpdate, async user => {
    try {
      const updatedProfile = await refreshProfile(user.id);
      await updateUserProfile(user.id, updatedProfile);
    } catch (e) {
      error('getAuthorizedUsers', e);
    }
  }).catch(error);

  return users;

}


export async function freshProfiles(users) {
  const res = await mapSeriesAsync(users, async user => {

    const { id: userId, settings } = user;

    try {

      const token = await getToken(user.id);

      if (!token) {
        return null;
      }

      const { profile } = await cw.requestProfile(safeUserId(userId), token);

      return {
        ...profile, tgId: user.id, tgUsername: user.username, settings,
      };

    } catch (e) {
      error('freshProfiles', userId, `"${user.userName}"`, e.message || e);
      if (e === 'InvalidToken') {
        await rmAuth(userId);
      }
    }
    return null;
  });
  return filter(res);
}

export async function saveUser(from, profile) {

  const { id, username } = from;
  const { first_name: firstName, last_name: lastName } = from;

  const $set = {
    firstName,
    lastName,
    username,
  };

  if (profile) {
    $set.profile = profile;
  }

  return User.updateOne({ id }, { $set, $currentDate: { ts: true } }, { upsert: true });

}

export async function updateUserProfile(id, profile) {

  const $set = {
    profile,
  };

  return User.updateOne({ id }, { $set, $currentDate: { ts: true } });

}


export async function isTrusted(userId, toUserId) {

  if (userId === toUserId) {
    return true;
  }

  const result = await User.findOne({
    id: userId,
    [`trusts.${toUserId}`]: true,
  });
  debug('isTrusted', result);
  return !!result;

}

export async function saveTrust(id, toUserId, value = true) {

  const $set = {
    [`trusts.${toUserId}`]: value,
    $currentDate: { ts: true },
  };

  return User.updateOne({ id }, { $set });

}

export function userSetting(user, key) {
  const setting = allSettings()[key];

  if (!setting) {
    throw new Error(`Unknown setting <code>${key}</code>`);
  }

  return settingValueWithDefault(setting, user.settings[key]);
}

export async function settingValue(userId, key) {

  const user = await User.findOne({ id: userId });

  if (!user) {
    throw new Error(`Unknown user <code>${userId}</code>`);
  }

  return userSetting(user, key);

}

function settingValueWithDefault(setting, value) {
  return value === undefined ? setting.defaults : value;
}

export function applyDefaults(settings) {
  return mapValues(allSettings(), (setting, key) => {
    return settingValueWithDefault(setting, settings[key]);
  });
}

export const NOTIFY_ORDER_FAIL = 'notifyOrderFail';
export const NOTIFY_SALES = 'notifySales';
export const NOTIFY_FOR_MOBS = 'notifyForMobs';
export const HELPER_MIN_HP = 'helperMinHp';

export function allSettings() {
  return {
    [HELPER_MIN_HP]: {
      type: Number,
      defaults: null,
    },
    [NOTIFY_FOR_MOBS]: {
      type: Boolean,
      defaults: false,
    },
    [NOTIFY_ORDER_FAIL]: {
      type: Boolean,
      defaults: true,
    },
    [NOTIFY_SALES]: {
      type: Boolean,
      defaults: false,
    },
  };
}

export async function usersFromCWNames(names) {
  if (!names.length) {
    return [];
  }
  return User.find({
    username: { $ne: null },
    'profile.userName': { $in: names },
  });
}
