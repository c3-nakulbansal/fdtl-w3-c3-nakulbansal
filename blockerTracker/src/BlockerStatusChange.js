var MS_PER_HOUR = 3600000;
var GROUP = 'blocker.customer, status';

function hoursByCustomerAndStatus() {
  var unresolved = Filter.ne('status', 'Resolved');
  // evaluate has no coalesce, so ended and still-open periods are summed separately.
  var ended = BlockerStatusChange.evaluate({
    projection: GROUP + ', sum(toMillis(endedAt) - toMillis(changedAt))',
    group: GROUP,
    filter: unresolved.and().exists('endedAt'),
  });
  var open = BlockerStatusChange.evaluate({
    projection: GROUP + ', sum(toMillis(now()) - toMillis(changedAt))',
    group: GROUP,
    filter: unresolved.and().not().exists('endedAt'),
  });

  var rows = {};
  [ended, open].forEach(function (result) {
    result.tuples.forEach(function (tuple) {
      var customer = tuple.cells[0].str;
      var status = tuple.cells[1].str;
      var key = customer + '|' + status;
      rows[key] = rows[key] || { customer: customer, status: status, hours: 0 };
      rows[key].hours += tuple.cells[2].number / MS_PER_HOUR;
    });
  });
  return Object.keys(rows).map(function (key) {
    return rows[key];
  });
}
