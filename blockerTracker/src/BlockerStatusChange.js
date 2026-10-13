var MS_PER_HOUR = 3600000;

function hoursByCustomerAndStatus() {
  return _sumWaits('blocker.customer, status', null).map(function (row) {
    return { customer: row.keys[0], status: row.keys[1], hours: row.hours };
  });
}

function monthlyWaits(customer) {
  var filter = customer ? Filter.eq('blocker.customer', customer) : null;
  return _sumWaits('year(changedAt), month(changedAt), status', filter).map(function (row) {
    return { year: row.keys[0], month: row.keys[1], status: row.keys[2], waits: row.waits, hours: row.hours };
  });
}

/**
 * Hours and number of unresolved periods per group, with open periods counted up to now.
 * evaluate has no coalesce, so ended and still-open periods are summed in separate calls.
 */
function _sumWaits(group, filter) {
  var waiting = filter ? Filter.ne('status', 'Resolved').and(filter) : Filter.ne('status', 'Resolved');
  var ended = BlockerStatusChange.evaluate({
    projection: group + ', sum(toMillis(endedAt) - toMillis(changedAt)), count()',
    group: group,
    filter: waiting.and().exists('endedAt'),
  });
  var open = BlockerStatusChange.evaluate({
    projection: group + ', sum(toMillis(now()) - toMillis(changedAt)), count()',
    group: group,
    filter: waiting.and().not().exists('endedAt'),
  });

  var keyCount = group.split(',').length;
  var rows = {};
  [ended, open].forEach(function (result) {
    result.tuples.forEach(function (tuple) {
      var keys = tuple.cells.slice(0, keyCount).map(function (cell) {
        return cell.str !== undefined ? cell.str : cell.number;
      });
      var id = keys.join('|');
      rows[id] = rows[id] || { keys: keys, hours: 0, waits: 0 };
      rows[id].hours += tuple.cells[keyCount].number / MS_PER_HOUR;
      rows[id].waits += tuple.cells[keyCount + 1].number;
    });
  });
  return Object.keys(rows).map(function (id) {
    return rows[id];
  });
}
