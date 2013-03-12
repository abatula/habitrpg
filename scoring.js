return;

//TODO


// Generated by CoffeeScript 1.4.0
var MODIFIER, algos, async, browser, character, cron, helpers, items, moment, score, updateStats, _;

async = require('async');

moment = require('moment');

_ = require('underscore');

helpers = require('./helpers');

browser = require('./browser');

character = require('./character');

items = require('./items');

algos = require('./algos');

MODIFIER = algos.MODIFIER;

score = function(model, taskId, direction, times, batch, cron) {
  var addPoints, calculateDelta, commit, delta, exp, gp, historyEntry, hp, lvl, newStats, num, obj, origStats, priority, r, subtractPoints, taskObj, taskPath, type, user, value, _ref, _ref1;
  user = model.at('_user');
  commit = false;
  if (batch == null) {
    commit = true;
    batch = new character.BatchUpdate(model);
    batch.startTransaction();
  }
  obj = batch.obj();
  _ref = obj.stats, gp = _ref.gp, hp = _ref.hp, exp = _ref.exp, lvl = _ref.lvl;
  taskPath = "tasks." + taskId;
  taskObj = obj.tasks[taskId];
  type = taskObj.type, value = taskObj.value;
  priority = taskObj.priority || '!';
  if (taskObj.value > obj.stats.gp && taskObj.type === 'reward') {
    r = confirm("Not enough GP to purchase this reward, buy anyway and lose HP? (Punishment for taking a reward you didn't earn).");
    if (!r) {
      batch.commit();
      return;
    }
  }
  delta = 0;
  if (times == null) {
    times = 1;
  }
  calculateDelta = function(adjustvalue) {
    if (adjustvalue == null) {
      adjustvalue = true;
    }
    return _.times(times, function(n) {
      var nextDelta;
      nextDelta = algos.taskDeltaFormula(value, direction);
      if (adjustvalue) {
        value += nextDelta;
      }
      return delta += nextDelta;
    });
  };
  addPoints = function() {
    var level, weaponStrength;
    level = user.get('stats.lvl');
    weaponStrength = items.items.weapon[user.get('items.weapon')].strength;
    exp += algos.expModifier(delta, weaponStrength, level, priority);
    return gp += algos.gpModifier(delta, 1, priority);
  };
  subtractPoints = function() {
    var armorDefense, helmDefense, level, shieldDefense;
    level = user.get('stats.lvl');
    armorDefense = items.items.armor[user.get('items.armor')].defense;
    helmDefense = items.items.head[user.get('items.head')].defense;
    shieldDefense = items.items.shield[user.get('items.shield')].defense;
    return hp += algos.hpModifier(delta, armorDefense, helmDefense, shieldDefense, level, priority);
  };
  switch (type) {
    case 'habit':
      calculateDelta();
      if (delta > 0) {
        addPoints();
      } else {
        subtractPoints();
      }
      if ((_ref1 = taskObj.history) == null) {
        taskObj.history = [];
      }
      if (taskObj.value !== value) {
        historyEntry = {
          date: +(new Date),
          value: value
        };
        taskObj.history.push(historyEntry);
        batch.set("" + taskPath + ".history", taskObj.history);
      }
      break;
    case 'daily':
      if (cron != null) {
        calculateDelta();
        subtractPoints();
      } else {
        calculateDelta(false);
        if (delta !== 0) {
          addPoints();
        }
      }
      break;
    case 'todo':
      if (cron != null) {
        calculateDelta();
      } else {
        calculateDelta();
        addPoints();
      }
      break;
    case 'reward':
      calculateDelta(false);
      gp -= Math.abs(taskObj.value);
      num = parseFloat(taskObj.value).toFixed(2);
      if (gp < 0) {
        hp += gp;
        gp = 0;
      }
  }
  taskObj.value = value;
  batch.set("" + taskPath + ".value", taskObj.value);
  origStats = _.clone(obj.stats);
  updateStats(model, {
    hp: hp,
    exp: exp,
    gp: gp
  }, batch);
  if (commit) {
    newStats = _.clone(batch.obj().stats);
    _.each(Object.keys(origStats), function(key) {
      return obj.stats[key] = origStats[key];
    });
    batch.setStats(newStats);
    batch.commit();
  }
  return delta;
};

/*
  Updates user stats with new stats. Handles death, leveling up, etc
  {stats} new stats
  {update} if aggregated changes, pass in userObj as update. otherwise commits will be made immediately
*/


updateStats = function(model, newStats, batch) {
  var gp, obj, tnl, user;
  user = model.at('_user');
  obj = batch.obj();
  if (obj.stats.lvl === 0) {
    return;
  }
  if (newStats.hp != null) {
    if (newStats.hp <= 0) {
      obj.stats.lvl = 0;
      obj.stats.hp = 0;
      return;
    } else {
      obj.stats.hp = newStats.hp;
    }
  }
  if (newStats.exp != null) {
    tnl = model.get('_tnl');
    if (obj.stats.lvl >= 100) {
      newStats.gp += newStats.exp / 15;
      newStats.exp = 0;
      obj.stats.lvl = 100;
    } else {
      if (newStats.exp >= tnl) {
        user.set('stats.exp', newStats.exp);
        while (newStats.exp >= tnl && obj.stats.lvl < 100) {
          newStats.exp -= tnl;
          obj.stats.lvl++;
          tnl = algos.tnl(obj.stats.lvl);
        }
        if (obj.stats.lvl === 100) {
          newStats.exp = 0;
        }
        obj.stats.hp = 50;
      }
    }
    obj.stats.exp = newStats.exp;
    if (!obj.flags.customizationsNotification && (obj.stats.exp > 10 || obj.stats.lvl > 1)) {
      batch.set('flags.customizationsNotification', true);
      obj.flags.customizationsNotification = true;
    }
    if (!obj.flags.itemsEnabled && obj.stats.lvl >= 2) {
      batch.set('flags.itemsEnabled', true);
      obj.flags.itemsEnabled = true;
    }
    if (!obj.flags.partyEnabled && obj.stats.lvl >= 3) {
      batch.set('flags.partyEnabled', true);
      obj.flags.partyEnabled = true;
    }
    if (!obj.flags.petsEnabled && obj.stats.lvl >= 4) {
      batch.set('flags.petsEnabled', true);
      obj.flags.petsEnabled = true;
    }
  }
  if (newStats.gp != null) {
    if (!(typeof gp !== "undefined" && gp !== null) || gp < 0) {
      gp = 0.0;
    }
    return obj.stats.gp = newStats.gp;
  }
};

/*
  At end of day, add value to all incomplete Daily & Todo tasks (further incentive)
  For incomplete Dailys, deduct experience
*/


cron = function(model) {
  var batch, daysPassed, expTally, hpAfter, hpBefore, lvl, obj, today, todoTally, user, _base, _base1, _ref, _ref1, _ref2, _ref3;
  user = model.at('_user');
  today = +(new Date);
  daysPassed = helpers.daysBetween(user.get('lastCron'), today, user.get('preferences.dayStart'));
  if (daysPassed > 0) {
    batch = new character.BatchUpdate(model);
    batch.startTransaction();
    batch.set('lastCron', today);
    obj = batch.obj();
    hpBefore = obj.stats.hp;
    todoTally = 0;
    _.each(obj.tasks, function(taskObj) {
      var absVal, completed, daysFailed, id, newValue, repeat, type, value, _ref;
      id = taskObj.id, type = taskObj.type, completed = taskObj.completed, repeat = taskObj.repeat;
      if (type === 'todo' || type === 'daily') {
        if (!completed) {
          daysFailed = daysPassed;
          if (type === 'daily' && repeat) {
            daysFailed = 0;
            _.times(daysPassed, function(n) {
              var thatDay;
              thatDay = moment().subtract('days', n + 1);
              if (repeat[helpers.dayMapping[thatDay.day()]] === true) {
                return daysFailed++;
              }
            });
          }
          score(model, id, 'down', daysFailed, batch, true);
        }
        if (type === 'daily') {
          if (completed) {
            newValue = taskObj.value + algos.taskDeltaFormula(taskObj.value, 'up');
            batch.set("tasks." + taskObj.id + ".value", newValue);
          }
          if ((_ref = taskObj.history) == null) {
            taskObj.history = [];
          }
          taskObj.history.push({
            date: +(new Date),
            value: taskObj.value
          });
          batch.set("tasks." + taskObj.id + ".history", taskObj.history);
          return batch.set("tasks." + taskObj.id + ".completed", false);
        } else {
          value = obj.tasks[taskObj.id].value;
          absVal = completed ? Math.abs(value) : value;
          return todoTally += absVal;
        }
      } else if (type === 'habit') {
        if (taskObj.up === false || taskObj.down === false) {
          if (Math.abs(taskObj.value) < 0.1) {
            return batch.set("tasks." + taskObj.id + ".value", 0);
          } else {
            return batch.set("tasks." + taskObj.id + ".value", taskObj.value / 2);
          }
        }
      }
    });
    if ((_ref = obj.history) == null) {
      obj.history = {};
    }
    if ((_ref1 = (_base = obj.history).todos) == null) {
      _base.todos = [];
    }
    if ((_ref2 = (_base1 = obj.history).exp) == null) {
      _base1.exp = [];
    }
    obj.history.todos.push({
      date: today,
      value: todoTally
    });
    expTally = obj.stats.exp;
    lvl = 0;
    while (lvl < (obj.stats.lvl - 1)) {
      lvl++;
      expTally += algos.tnl(lvl);
    }
    obj.history.exp.push({
      date: today,
      value: expTally
    });
    _ref3 = [obj.stats.hp, hpBefore], hpAfter = _ref3[0], obj.stats.hp = _ref3[1];
    batch.setStats();
    batch.set('history', obj.history);
    batch.commit();
    browser.resetDom(model);
    return setTimeout((function() {
      return user.set('stats.hp', hpAfter);
    }), 1000);
  }
};

exports = {
  score: score,
  cron: cron,
  expModifier: algos.expModifier,
  hpModifier: algos.hpModifier,
  taskDeltaFormula: algos.taskDeltaFormula
};
